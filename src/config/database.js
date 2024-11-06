const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define la ruta de la base de datos
const dbPath = path.join(__dirname, '../../database/mydb.sqlite');

// Crea una nueva conexión a la base de datos
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con la base de datos:', err);
        return;
    }
    console.log('Conectado a la base de datos SQLite');
    
    // Crear todas las tablas necesarias
    db.serialize(() => {
        // Tabla bingo_juegos
        db.run(`
            CREATE TABLE IF NOT EXISTS bingo_juegos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                estado TEXT NOT NULL,
                hora_inicio DATETIME NOT NULL,
                hora_fin DATETIME,
                numeros_cantados TEXT DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error al crear tabla bingo_juegos:', err);
            } else {
                console.log('Tabla bingo_juegos verificada/creada');
            }
        });

        // Tabla historial
        db.run(`
            CREATE TABLE IF NOT EXISTS historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha_hora TEXT NOT NULL,
                json_numeros TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error al crear tabla historial:', err);
            } else {
                console.log('Tabla historial verificada/creada');
            }
        });
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