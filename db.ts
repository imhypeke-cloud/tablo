import Database from 'better-sqlite3';
import { format } from 'date-fns';

const db = new Database('acs.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'Worker', 'ITR', 'Contractor', 'Guest'
    company_id INTEGER,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS access_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    direction TEXT NOT NULL, -- 'IN', 'OUT'
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    gate_id TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );
`);

// Seed data if empty
const employeeCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
if (employeeCount.count === 0) {
  const companies = ['Main Build Corp', 'Electro Systems', 'Plumbing Pro', 'Security Plus'];
  companies.forEach(name => db.prepare('INSERT INTO companies (name) VALUES (?)').run(name));

  const categories = ['Worker', 'ITR', 'Contractor', 'Guest'];
  for (let i = 1; i <= 100; i++) {
    db.prepare('INSERT INTO employees (name, category, company_id) VALUES (?, ?, ?)')
      .run(`Employee ${i}`, categories[Math.floor(Math.random() * categories.length)], Math.floor(Math.random() * 4) + 1);
  }
}

export function recordEvent(employeeId: number, direction: 'IN' | 'OUT', gateId: string) {
  const stmt = db.prepare('INSERT INTO access_events (employee_id, direction, gate_id) VALUES (?, ?, ?)');
  stmt.run(employeeId, direction, gateId);
  return getStats();
}

export function getStats() {
  const today = format(new Date(), 'yyyy-MM-dd');

  // Currently on site: Last event today is 'IN'
  // Or more robustly: count of people whose last event ever is 'IN' (assuming they leave eventually)
  // For a construction site, we usually reset at midnight or just count current state.
  
  const currentlyOnSite = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT employee_id, direction 
      FROM access_events 
      WHERE id IN (SELECT MAX(id) FROM access_events GROUP BY employee_id)
      AND direction = 'IN'
    )
  `).get() as { count: number };

  const enteredToday = db.prepare(`
    SELECT COUNT(*) as count 
    FROM access_events 
    WHERE direction = 'IN' AND date(timestamp) = date('now', 'localtime')
  `).get() as { count: number };

  const exitedToday = db.prepare(`
    SELECT COUNT(*) as count 
    FROM access_events 
    WHERE direction = 'OUT' AND date(timestamp) = date('now', 'localtime')
  `).get() as { count: number };

  const byCategory = db.prepare(`
    SELECT e.category, COUNT(*) as count
    FROM employees e
    JOIN (
      SELECT employee_id, direction 
      FROM access_events 
      WHERE id IN (SELECT MAX(id) FROM access_events GROUP BY employee_id)
      AND direction = 'IN'
    ) s ON e.id = s.employee_id
    GROUP BY e.category
  `).all() as { category: string, count: number }[];

  const recentEvents = db.prepare(`
    SELECT e.name, e.category, a.direction, a.timestamp, a.gate_id
    FROM access_events a
    JOIN employees e ON a.employee_id = e.id
    ORDER BY a.id DESC
    LIMIT 10
  `).all();

  return {
    currentlyOnSite: currentlyOnSite.count,
    enteredToday: enteredToday.count,
    exitedToday: exitedToday.count,
    byCategory: byCategory.reduce((acc, curr) => ({ ...acc, [curr.category]: curr.count }), {}),
    recentEvents
  };
}

export function getRandomEmployee() {
  return db.prepare('SELECT id FROM employees ORDER BY RANDOM() LIMIT 1').get() as { id: number };
}

export function getEmployeeLastDirection(employeeId: number) {
  const last = db.prepare('SELECT direction FROM access_events WHERE employee_id = ? ORDER BY id DESC LIMIT 1').get(employeeId) as { direction: string } | undefined;
  return last?.direction || 'OUT';
}
