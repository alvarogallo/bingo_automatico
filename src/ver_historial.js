// src/ver_historial.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Construir la ruta correcta a la base de datos
//const dbPath = path.join(__dirname, '../src/database/mydb.sqlite');
const dbPath = path.join(__dirname, '../database/mydb.sqlite');
console.log('Intentando conectar a la base de datos en:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        process.exit(1);
    }
    console.log('Conexión exitosa a la base de datos');
});

// Función para formatear los números del bingo
const formatearNumeros = (jsonString) => {
    try {
        const data = JSON.parse(jsonString);
        return data.numeros.join(', ');
    } catch (e) {
        return jsonString;
    }
};

// Consultar los datos
db.serialize(() => {
    console.log("\nConsultando historial de bingos...");
    
    db.all('SELECT * FROM historial ORDER BY created_at DESC', (err, rows) => {
        if (err) {
            console.error('Error al consultar datos:', err);
            db.close();
            return;
        }

        console.log("\nHistorial de Bingos:");
        if (rows.length === 0) {
            console.log("No hay registros en el historial");
        } else {
            rows.forEach(row => {
                console.log('\n=================================');
                console.log(`ID: ${row.id}`);
                console.log(`Hora del Bingo: ${row.fecha_hora}`);
                console.log('Números cantados:');
                console.log(formatearNumeros(row.json_numeros));
                console.log(`Registro creado: ${row.created_at}`);
                console.log('=================================');
            });
            console.log(`\nTotal de bingos registrados: ${rows.length}`);
        }

        // Cerrar la conexión
        db.close(() => {
            console.log('\nConsulta completada y conexión cerrada.');
        });
    });
});

// Manejar errores de conexión
process.on('SIGINT', () => {
    db.close(() => {
        console.log('\nConexión cerrada por interrupción del usuario');
        process.exit(0);
    });
});