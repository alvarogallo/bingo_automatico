// src/server.js
require('dotenv').config(); // Cargar variables de entorno

const http = require('http');
const db = require('./config/database');
const { renderHistorial } = require('./routes/historial');

const { 
    obtenerHoraActual, 
    obtenerProximaHora, 
    calcularTiempoRestante,
    generarNumeroUnico 
} = require('./utils/funciones');

let intervalId = null;
let bingoActivo = false;
let juegoIdActual = null;


const intervalo = parseInt(process.env.INTERVALO, 10) * 1000;
const segundos = parseInt(process.env.INTERVALO, 10);
const frecuencia = process.env.FRECUENCIA || 'hora';

// Log para mostrar los segundos y milisegundos
console.log(`Configuración cargada:`);
console.log(`- Intervalo: ${segundos} segundos (${intervalo} milisegundos)`);
console.log(`- Frecuencia: ${frecuencia} (bingos cada ${frecuencia})`);


const iniciarNuevoBingo = async () => {
    const proximaHora = obtenerProximaHora();
    
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO bingo_juegos (estado, hora_inicio, numeros_cantados) 
             VALUES (?, ?, ?)`,

            ['programado', proximaHora.formateada, '[]'],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

const generarSiguienteNumero = async (juegoId) => {
    try {
        const row = await new Promise((resolve, reject) => {
            db.get(
                'SELECT numeros_cantados FROM bingo_juegos WHERE id = ?',
                [juegoId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        let numerosCantados = [];
        try {
            numerosCantados = JSON.parse(row.numeros_cantados || '[]');
        } catch (e) {
            console.log('Error parseando numeros_cantados en generarSiguienteNumero, usando array vacío');
            numerosCantados = [];
        }

        const nuevoNumero = generarNumeroUnico(numerosCantados);

        if (nuevoNumero) {
            numerosCantados.push(nuevoNumero);
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE bingo_juegos SET numeros_cantados = ? WHERE id = ?',
                    [JSON.stringify(numerosCantados), juegoId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            try {
                const bingoInfo = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT hora_inicio FROM bingo_juegos WHERE id = ?',
                        [juegoId],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });
                const fecha = new Date(bingoInfo.hora_inicio);
                const fechaBingo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;

                await emitirEventoLocal(
                    'bingo_auto', 
                    nuevoNumero,
                    numerosCantados.length, // secuencia actual
                    fechaBingo              // nombre del bingo
                );
                console.log('Número enviado al socket:', nuevoNumero, 'Secuencia:', numerosCantados.length);
            

            } catch (socketError) {
                console.error('Error enviando número al socket:', socketError);
                // No detenemos el bingo si falla el envío al socket
            }
            console.log(`Número generado: ${nuevoNumero}`);
            return numerosCantados;
        } else {
            clearInterval(intervalId);
            intervalId = null;
            bingoActivo = false;
            juegoIdActual = null;
            console.log('\n=== Bingo Completado ===');
            console.log('Guardando en historial...');

            try {
                // Obtener información del bingo actual
                const bingoActual = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT hora_inicio FROM bingo_juegos WHERE id = ?',
                        [juegoId],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });


                const fecha = new Date(bingoActual.hora_inicio);
                const year = fecha.getFullYear();
                const month = String(fecha.getMonth() + 1).padStart(2, '0');
                const day = String(fecha.getDate()).padStart(2, '0');
                const hours = String(fecha.getHours()).padStart(2, '0');
                const minutes = String(fecha.getMinutes()).padStart(2, '0');
                
                const horaFormateada = `${year}-${month}-${day} ${hours}:${minutes}`;

                const numerosParaGuardar = JSON.stringify({ numeros: numerosCantados });

                console.log('Datos a guardar:');
                console.log('- Hora:', horaFormateada);
                console.log('- Números:', numerosParaGuardar);

                // Guardar en historial
                const resultadoInsert = await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO historial (fecha_hora, json_numeros) VALUES (?, ?)',
                        [horaFormateada, numerosParaGuardar],
                        function(err) {
                            if (err) {
                                console.error('Error al insertar en historial:', err);
                                reject(err);
                            } else {
                                resolve(this.lastID);
                            }
                        }
                    );
                });

                console.log('Guardado exitoso en historial con ID:', resultadoInsert);

                // Verificar el guardado
                const verificacion = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT * FROM historial WHERE id = ?',
                        [resultadoInsert],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });

                console.log('Verificación del registro guardado:');
                console.log(verificacion);

                // Actualizar estado del juego
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE bingo_juegos SET estado = ?, hora_fin = ? WHERE id = ?',
                        ['terminado', obtenerHoraActual().formateada, juegoId],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                console.log('=== Proceso de guardado completado ===\n');
                return null;
            } catch (error) {
                console.error('Error en el proceso de guardado:', error);
                throw error;
            }
        }
    } catch (error) {
        console.error('Error generando número:', error);
        return null;
    }
};

const obtenerEstadoJuego = async () => {
    try {
        let row = await new Promise((resolve, reject) => {
            db.get(
                "SELECT * FROM bingo_juegos WHERE estado IN ('programado', 'en_curso') ORDER BY id DESC LIMIT 1",
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!row) {
            const nuevoJuegoId = await iniciarNuevoBingo();
            row = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM bingo_juegos WHERE id = ?', [nuevoJuegoId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }

        const horaActual = obtenerHoraActual().fecha;
        const horaInicio = new Date(row.hora_inicio);

        let numerosCantados = [];
        try {
            numerosCantados = JSON.parse(row.numeros_cantados || '[]');
        } catch (e) {
            console.log('Error parseando numeros_cantados, usando array vacío');
            numerosCantados = [];
        }

        if (row.estado === 'programado' && horaActual >= horaInicio) {
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE bingo_juegos SET estado = ? WHERE id = ?',
                    ['en_curso', row.id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            row.estado = 'en_curso';
            
            bingoActivo = true;
            juegoIdActual = row.id;

            if (!intervalId) {
                intervalId = setInterval(() => {
                    generarSiguienteNumero(row.id).catch(err => {
                        console.error('Error generando número:', err);
                    });
                }, intervalo);
            }
        }

        return {
            estado: row.estado,
            horaInicio: row.hora_inicio,
            numerosCantados: numerosCantados,
            tiempoRestante: row.estado === 'programado' ? 
                calcularTiempoRestante(row.hora_inicio) : null
        };
    } catch (error) {
        console.error('Error obteniendo estado:', error);
        throw error;
    }
};

const server = http.createServer(async (req, res) => {
    try {
        if (req.url === '/historial') {
            await renderHistorial(res);
        } else if (req.url === '/limpiar-tablas') {
            // Limpiar las tablas y reiniciar el sistema
            const estadoActual = await obtenerEstadoJuego();
            if (estadoActual.estado === 'en_curso') {
                console.log('Intento de limpieza con bingo en curso');
                res.writeHead(400, {'Content-Type': 'text/html; charset=utf-8'});
                res.end(`
                    <h1>No se puede limpiar el sistema</h1>
                    <p>Hay un bingo en curso. Espere a que termine.</p>
                    <a href="/">Volver</a>
                `);
                return;
            }            
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            bingoActivo = false;
            juegoIdActual = null;

            await new Promise((resolve, reject) => {
                db.run("DELETE FROM bingo_juegos", (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log('Tablas limpiadas, reiniciando sistema...');
            res.writeHead(302, { 'Location': '/' }); // Redireccionar a la página principal
            res.end();            
        } else {
            res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            const estadoJuego = await obtenerEstadoJuego();

            const formatearFrecuencia = (freq) => {
                return freq === 'media' ? 'media hora' : 'hora';
            };

            let html = `
                <html>
                <head>
                    <title>Sistema de Bingo</title>
                    <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                        text-align: center;
                    }
                    /* ... otros estilos existentes ... */
                    
                    .admin-controls {
                        margin: 20px 0;
                        padding: 20px;
                        background-color: #f8f8f8;
                        border-radius: 5px;
                    }
                    .admin-button {
                        background-color: #dc3545;
                        color: white;
                        padding: 10px 20px;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 1em;
                        text-decoration: none;
                        display: inline-block;
                    }
                    .admin-button:hover {
                        background-color: #c82333;
                    }
                    .warning-text {
                        color: #dc3545;
                        font-size: 0.9em;
                        margin-top: 10px;
                    }
                </style>                    
                </head>
                <body>
                    <h1>Sistema de Bingo</h1>
                    <a href="/historial" class="historial-link">Ver Historial</a>
            `;

            if (estadoJuego.estado === 'programado') {
                html += `
                    <h2>Próximo bingo en:</h2>
                    <div class="admin-controls">
                        <a href="/limpiar-tablas" class="admin-button" 
                        onclick="return confirm('¿Estás seguro? Esto detendrá el bingo actual si existe y limpiará todas las tablas.')">
                            Reiniciar Sistema
                        </a>
                        <p class="warning-text">⚠️ Esto detendrá el bingo actual y limpiará todas las tablas</p>
                    </div>                    
                    <div id="countdown" class="countdown">Calculando...</div>
                    <p>Hora de inicio: ${estadoJuego.horaInicio}</p>
                    
                    <script>
                        function actualizarContador() {
                            const horaObjetivo = new Date('${estadoJuego.horaInicio}');
                            const ahora = new Date();
                            let diferencia = horaObjetivo - ahora;
                            
                            if (diferencia <= 0) {
                                location.reload();
                                return;
                            }

                            const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
                            const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);
                            
                            document.getElementById('countdown').textContent = 
                                minutos + ':' + segundos.toString().padStart(2, '0');
                        }

                        actualizarContador();
                        setInterval(actualizarContador, 1000);

                        const horaObjetivo = new Date('${estadoJuego.horaInicio}');
                        const tiempoHastaRecarga = horaObjetivo - new Date();
                        if (tiempoHastaRecarga > 0) {
                            setTimeout(() => location.reload(), tiempoHastaRecarga);
                        }
                    </script>
                `;
            } else if (estadoJuego.estado === 'en_curso') {
                const numeros = estadoJuego.numerosCantados;
                html += `
                    <h2>Bingo en curso</h2>
                    <div class="numbers">
                        <h3>Último número: ${numeros[numeros.length - 1] || 'Generando...'}</h3>
                        <h4>Números cantados: ${numeros.join(', ') || 'Iniciando...'}</h4>
                        <p>Total números generados: ${numeros.length}/75</p>
                    </div>
                    
                    <script>
                        setTimeout(() => location.reload(), ${intervalo});
                    </script>
                `;
            }

            // Agregar la información del sistema al final
            html += `
                <hr>
                <div class="footer-info">
                    <p>Bingo cada ${formatearFrecuencia(process.env.FRECUENCIA || 'hora')}</p>
                    <p>Los cartones se cantan cada ${process.env.INTERVALO || 10} segundos</p>
                </div>
                </body>
                </html>
            `;

            res.end(html);
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.writeHead(500, {'Content-Type': 'text/html; charset=utf-8'});
        res.end('<h1>Error al procesar la solicitud</h1>');
    }
});

process.on('SIGINT', async () => {
    console.log('\nRecibida señal de cierre...');
    if (bingoActivo) {
        console.log('Hay un bingo activo, continuará en segundo plano');
        console.log('ID del juego activo:', juegoIdActual);
        console.log('Para detener completamente el proceso, usa SIGTERM');
    } else {
        if (intervalId) {
            clearInterval(intervalId);
        }
        console.log('No hay bingo activo, cerrando proceso');
        process.exit(0);
    }
});

process.on('SIGTERM', () => {
    console.log('\nForzando cierre del proceso...');
    if (intervalId) {
        clearInterval(intervalId);
    }
    process.exit(0);
});

const emitirEventoLocal = async (evento, numero, secuencia, fecha_bingo) => {
    try {
        const numeroString = numero.toString();

        // Crear el mensaje en el formato específico que espera el servidor
        const mensaje = {
            numero: numeroString,
            sec: secuencia,
            timestamp: new Date().toISOString()
        };

        const data = {
            canal: process.env.SOCKET_CANAL,
            token: process.env.SOCKET_TOKEN,
            evento: `Bingo_${fecha_bingo}`,
            mensaje: mensaje
        };

        const response = await fetch(process.env.SOCKET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(data))
            },
            body: JSON.stringify(data)
        });

        const httpCode = response.status;
        const responseData = await response.text();

        console.log('Status Code:', httpCode);
        console.log('Response:', responseData);

        return {
            httpCode,
            response: responseData
        };

    } catch (error) {
        console.error('Error en emitirEventoLocal:', error);
        throw error;
    }
};

module.exports = {
    emitirEventoLocal
};
// Función de inicialización del sistema
const inicializarSistema = async () => {
    try {
        console.log('Inicializando sistema...');
        
        // Verificar si hay un bingo activo o programado
        const bingoActual = await new Promise((resolve, reject) => {
            db.get(
                "SELECT * FROM bingo_juegos WHERE estado IN ('programado', 'en_curso') ORDER BY id DESC LIMIT 1",
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (bingoActual) {
            const horaInicio = new Date(bingoActual.hora_inicio);
            const ahora = new Date();

            if (bingoActual.estado === 'en_curso') {
                console.log('Continuando bingo en curso...');
                bingoActivo = true;
                juegoIdActual = bingoActual.id;

                if (!intervalId) {
                    intervalId = setInterval(() => {
                        generarSiguienteNumero(bingoActual.id).catch(err => {
                            console.error('Error generando número:', err);
                        });
                    }, intervalo);
                }
            } else if (bingoActual.estado === 'programado' && ahora >= horaInicio) {
                console.log('Iniciando bingo programado...');
                await db.run(
                    'UPDATE bingo_juegos SET estado = ? WHERE id = ?',
                    ['en_curso', bingoActual.id]
                );
                
                bingoActivo = true;
                juegoIdActual = bingoActual.id;

                if (!intervalId) {
                    intervalId = setInterval(() => {
                        generarSiguienteNumero(bingoActual.id).catch(err => {
                            console.error('Error generando número:', err);
                        });
                    }, intervalo);
                }
            }
        }
    } catch (error) {
        console.error('Error en la inicialización del sistema:', error);
    }
};
inicializarSistema();
// Iniciar el servidor y el sistema
setInterval(inicializarSistema, 60000); // Verificar cada minuto
server.listen(3000, () => {
    console.log('Servidor ejecutándose en http://localhost:3000/');
    
});

// server.listen(3000, () => {
//     console.log('Servidor ejecutándose en http://localhost:3000/');
// });

const continuarBingoEnSegundoPlano = async (juegoId) => {
    try {
        const row = await new Promise((resolve, reject) => {
            db.get(
                'SELECT estado, numeros_cantados FROM bingo_juegos WHERE id = ?',
                [juegoId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (row && row.estado === 'en_curso') {
            bingoActivo = true;
            juegoIdActual = juegoId;

            if (!intervalId) {
                console.log('Reiniciando generación de números para bingo en curso');
                intervalId = setInterval(() => {
                    generarSiguienteNumero(juegoId).catch(err => {
                        console.error('Error generando número:', err);
                    });
                }, intervalo);
            }
        }
    } catch (error) {
        console.error('Error al continuar bingo en segundo plano:', error);
    }
};