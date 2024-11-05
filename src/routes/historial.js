// src/routes/historial.js
const db = require('../config/database');

const limpiarHistorialAntiguo = async () => {
    try {
        const count = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as total FROM historial', (err, row) => {
                if (err) reject(err);
                else resolve(row.total);
            });
        });

        if (count > 64) {
            const registrosABorrar = count - 64;
            await new Promise((resolve, reject) => {
                db.run(
                    'DELETE FROM historial WHERE id IN (SELECT id FROM historial ORDER BY created_at ASC LIMIT ?)',
                    [registrosABorrar],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            console.log(`Se eliminaron ${registrosABorrar} registros antiguos del historial`);
        }
    } catch (error) {
        console.error('Error limpiando historial:', error);
    }
};

const obtenerHistorial = () => {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT fecha_hora, json_numeros, created_at FROM historial ORDER BY created_at DESC',
            [],
            (err, rows) => {
                if (err) {
                    console.error('Error obteniendo historial:', err);
                    reject(err);
                    return;
                }
                
                try {
                    const historial = rows.map(row => ({
                        fecha_hora: row.fecha_hora,
                        numeros: JSON.parse(row.json_numeros).numeros,
                        created_at: row.created_at
                    }));
                    resolve(historial);
                } catch (e) {
                    console.error('Error procesando datos del historial:', e);
                    reject(e);
                }
            }
        );
    });
};

const renderHistorial = async (res) => {
    try {
        await limpiarHistorialAntiguo();
        const historial = await obtenerHistorial();
        console.log('Historial obtenido:', historial);

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Historial de Bingos</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                        padding: 20px;
                        background-color: #f5f5f5;
                    }
                    .historial-item {
                        border: 1px solid #ddd;
                        margin: 10px 0;
                        padding: 15px;
                        border-radius: 5px;
                        background-color: white;
                    }
                    .fecha {
                        font-weight: bold;
                        color: #0066cc;
                        font-size: 1.2em;
                    }
                    .grid-numeros {
                        display: grid;
                        grid-template-columns: repeat(15, 1fr);
                        gap: 5px;
                        margin: 10px 0;
                    }
                    .numero {
                        padding: 5px;
                        background-color: #f0f0f0;
                        border-radius: 3px;
                        text-align: center;
                    }
                    .volver {
                        display: inline-block;
                        margin: 20px 0;
                        padding: 10px 20px;
                        background-color: #0066cc;
                        color: white;
                        text-decoration: none;
                        border-radius: 5px;
                    }
                    .volver:hover {
                        background-color: #0052a3;
                    }
                </style>
            </head>
            <body>
                <h1>Historial de Bingos</h1>
                <a href="/" class="volver">&larr; Volver al Bingo</a>
        `;

        if (historial.length === 0) {
            html += `
                <div style="margin: 20px; padding: 20px; background-color: white; border-radius: 5px;">
                    <p>No hay registros en el historial aún.</p>
                    <p>Los bingos completados aparecerán aquí.</p>
                </div>
            `;
        } else {
            historial.forEach(item => {
                html += `
                    <div class="historial-item">
                        <div class="fecha">Bingo de las ${item.fecha_hora}</div>
                        <div class="grid-numeros">
                            ${item.numeros.map(num => 
                                `<div class="numero">${num}</div>`
                            ).join('')}
                        </div>
                    </div>
                `;
            });
        }

        html += `
            </body>
            </html>
        `;

        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Language': 'es'
        });
        res.end(html);
    } catch (error) {
        console.error('Error renderizando historial:', error);
        res.writeHead(500, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Error</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                        text-align: center;
                    }
                    .error {
                        color: red;
                        margin: 20px;
                        padding: 20px;
                        border: 1px solid red;
                        border-radius: 5px;
                    }
                    .volver {
                        display: inline-block;
                        margin: 20px 0;
                        padding: 10px 20px;
                        background-color: #0066cc;
                        color: white;
                        text-decoration: none;
                        border-radius: 5px;
                    }
                </style>
            </head>
            <body>
                <h1>Error al cargar el historial</h1>
                <div class="error">
                    ${error.message}
                </div>
                <a href="/" class="volver">Volver al inicio</a>
            </body>
            </html>
        `);
    }
};

module.exports = {
    renderHistorial
};