// src/scripts/createTable.js
const db = require('../config/database');

const createTables = () => {
    db.serialize(() => {
        // Tabla para el estado del sistema
        db.run(`
            CREATE TABLE IF NOT EXISTS variables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                variable TEXT NOT NULL UNIQUE,
                valor TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla para los juegos de bingo
        db.run(`
            CREATE TABLE IF NOT EXISTS bingo_juegos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                estado TEXT NOT NULL, -- 'programado', 'en_curso', 'terminado'
                hora_inicio DATETIME NOT NULL,
                hora_fin DATETIME,
                numeros_cantados TEXT DEFAULT '[]', -- JSON array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha_hora TIME NOT NULL,
                json_numeros TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Tablas creadas exitosamente');
    });
};

createTables();