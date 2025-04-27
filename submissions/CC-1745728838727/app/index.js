// Placeholder Node.js application code (index.js)
// Based on the example provided in the challenge.
// In a real scenario, this would include database connection logic.

const express = require('express');
const app = express();
const port = 3000;

// Placeholder: Database connection setup would go here
// const { Pool } = require('pg');
// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASSWORD,
//   port: 5432,
// });

app.get('/', async (req, res) => {
  // Placeholder: Query the database
  // try {
  //   const result = await pool.query('SELECT NOW()');
  //   res.send(`Hello from Kubernetes! DB Time: ${result.rows[0].now}`);
  // } catch (err) {
  //   console.error(err);
  //   res.status(500).send('Error connecting to database');
  // }
  res.send('Hello from Kubernetes! (Demo App)');
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
}); 