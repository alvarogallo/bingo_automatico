const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database/mydb.sqlite');

// Consultar la estructura de la tabla
db.all("PRAGMA table_info(historial)", (err, tableInfo) => {
  if (err) {
    throw err;
  }

  console.log("Estructura de la tabla 'historial':");
  tableInfo.forEach(column => {
    console.log(`- ${column.name} (${column.type})`);
  });

  // Consultar los datos de la tabla
  db.all('SELECT * FROM historial', (err, rows) => {
    if (err) {
      throw err;
    }

    console.log("\nDatos de la tabla 'historial':");
    console.log(rows);
    db.close();
  });
});