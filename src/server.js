// src/server.js
require('dotenv').config(); // Cargar variables de entorno

const http = require('http');
const db = require('./config/database');
const { 
    obtenerHoraActual, 
    obtenerProximaHora, 
    calcularTiempoRestante,
    generarNumeroUnico 
} = require('./utils/funciones');

let intervalId = null;

const intervalo = parseInt(process.env.INTERVALO, 10) * 1000;
const segundos = parseInt(process.env.INTERVALO, 10);
const milisegundos = segundos * 1000;

// Log para mostrar los segundos y milisegundos
console.log(`Intervalo configurado: ${segundos} segundos (${milisegundos} milisegundos)`);


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

            console.log(`Número generado: ${nuevoNumero}`);
            return numerosCantados;
        } else {
            clearInterval(intervalId);
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
            return null;
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
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});

    try {
        const estadoJuego = await obtenerEstadoJuego();
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
                </style>
            </head>
            <body>
                <h1>Sistema de Bingo</h1>
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
                    setTimeout(() => location.reload(), ${intervalo}); // Usar el intervalo del archivo .env
                </script>
            `;
        }

        html += `
            </body>
            </html>
        `;

        res.end(html);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.end('<h1>Error al procesar la solicitud</h1>');
    }
});

server.listen(3000, () => {
    console.log('Servidor ejecutándose en http://localhost:3000/');
});
