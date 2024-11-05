const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define la ruta de la base de datos
const dbPath = path.join(__dirname, '../database/mydb.sqlite');

// Crea una nueva conexión a la base de datos
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con la base de datos:', err);
        return;
    }
    console.log('Conectado a la base de datos SQLite');
    
    // Aquí puedes crear tus tablas si lo necesitas
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE
    )`, (err) => {
        if (err) {
            console.error('Error al crear la tabla:', err);
            return;
        }
        console.log('Tabla usuarios creada o ya existente');
    });
});

// Manejo del cierre de la conexión
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error al cerrar la base de datos:', err);
            return;
        }
        console.log('Conexión a la base de datos cerrada');
        process.exit(0);
    });
});

module.exports = db;