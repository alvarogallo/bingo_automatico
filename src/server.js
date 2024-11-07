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
                await emitirEventoLocal('bingo_auto', nuevoNumero);
                console.log('Número enviado al socket:', nuevoNumero);
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

            if (!intervalId) {
                intervalId = setInterval(() => generarSiguienteNumero(row.id), intervalo); // Usar el intervalo del archivo .env
            }
            await continuarBingoEnSegundoPlano(row.id);
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
                        .countdown {
                            font-size: 2em;
                            color: #0066cc;
                            margin: 20px 0;
                        }
                        .numbers {
                            margin: 20px 0;
                            font-size: 1.2em;
                        }
                        .historial-link {
                            display: inline-block;
                            margin: 20px 0;
                            padding: 10px 20px;
                            background-color: #0066cc;
                            color: white;
                            text-decoration: none;
                            border-radius: 5px;
                        }
                        .historial-link:hover {
                            background-color: #0052a3;
                        }
                        hr {
                            margin: 30px auto;
                            width: 80%;
                            border: 0;
                            height: 1px;
                            background-color: #ccc;
                        }
                        .footer-info {
                            color: #666;
                            font-size: 0.9em;
                            margin: 20px 0;
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

const emitirEventoLocal = async (evento, numero) => {
    try {
        const numeroString = numero.toString();

        // Crear el mensaje en el formato específico que espera el servidor
        const mensaje = {
            numero: numeroString,
            timestamp: new Date().toISOString()
        };

        const data = {
            canal: process.env.SOCKET_CANAL,
            token: process.env.SOCKET_TOKEN,
            evento: evento,
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

server.listen(3000, () => {
    console.log('Servidor ejecutándose en http://localhost:3000/');
});

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