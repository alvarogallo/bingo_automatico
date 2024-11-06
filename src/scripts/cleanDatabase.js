// src/scripts/cleanDatabase.js
const db = require('../config/database');


const limpiarBaseDatos = () => {
    db.serialize(() => {
        // Limpiar tabla de bingo_juegos
        db.run("DELETE FROM bingo_juegos", (err) => {
            if (err) {
                console.error('Error al limpiar bingo_juegos:', err);
            } else {
                console.log('Tabla bingo_juegos limpiada exitosamente');
            }
        });

        // Limpiar tabla de variables
        db.run("DELETE FROM variables", (err) => {
            if (err) {
                console.error('Error al limpiar variables:', err);
            } else {
                console.log('Tabla variables limpiada exitosamente');
            }
        });
    });
};

limpiarBaseDatos()