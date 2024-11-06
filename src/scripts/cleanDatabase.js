// src/scripts/cleanDatabase.js
const db = require('../config/database');

const limpiarBaseDatos = () => {
    db.serialize(() => {
        // Limpiar tabla bingo_juegos
        db.run("DELETE FROM bingo_juegos", (err) => {
            if (err) {
                console.error('Error al limpiar bingo_juegos:', err);
            } else {
                console.log('Tabla bingo_juegos limpiada exitosamente');
            }
        });

        // Limpiar tabla historial
        db.run("DELETE FROM historial", (err) => {
            if (err) {
                console.error('Error al limpiar historial:', err);
            } else {
                console.log('Tabla historial limpiada exitosamente');
            }
        });
    });

    // Cerrar la conexión después de un tiempo prudente
    setTimeout(() => {
        db.close((err) => {
            if (err) {
                console.error('Error al cerrar la base de datos:', err);
            } else {
                console.log('Base de datos limpiada y cerrada correctamente');
            }
            process.exit(0);
        });
    }, 1000);
};

limpiarBaseDatos();