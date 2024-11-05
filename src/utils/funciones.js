// src/utils/funciones.js
const obtenerHoraActual = () => {
    const now = new Date();
    // Ajustar a timezone de Bogotá (UTC-5)
    const bogotaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    
    const year = bogotaTime.getFullYear();
    const month = String(bogotaTime.getMonth() + 1).padStart(2, '0');
    const day = String(bogotaTime.getDate()).padStart(2, '0');
    const hours = String(bogotaTime.getHours()).padStart(2, '0');
    const minutes = String(bogotaTime.getMinutes()).padStart(2, '0');
    const seconds = String(bogotaTime.getSeconds()).padStart(2, '0');
    
    return {
        fecha: bogotaTime,
        formateada: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    };
};

// src/utils/funciones.js
const obtenerProximaHora = () => {
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const frecuencia = process.env.FRECUENCIA || 'hora'; // valor por defecto 'hora'
    
    // Obtener minutos actuales
    const minutos = ahora.getMinutes();

    // Si es frecuencia media hora
    if (frecuencia === 'media') {
        if (minutos < 30) {
            // Si estamos antes de la media hora, programar para XX:30
            ahora.setMinutes(30);
            ahora.setSeconds(0);
            ahora.setMilliseconds(0);
        } else {
            // Si estamos después de la media hora, programar para la siguiente hora
            ahora.setHours(ahora.getHours() + 1);
            ahora.setMinutes(0);
            ahora.setSeconds(0);
            ahora.setMilliseconds(0);
        }
    } else {
        // Para frecuencia 'hora', mantener el comportamiento original
        ahora.setHours(ahora.getHours() + 1);
        ahora.setMinutes(0);
        ahora.setSeconds(0);
        ahora.setMilliseconds(0);
    }

    const year = ahora.getFullYear();
    const month = String(ahora.getMonth() + 1).padStart(2, '0');
    const day = String(ahora.getDate()).padStart(2, '0');
    const hours = String(ahora.getHours()).padStart(2, '0');
    const minutes = String(ahora.getMinutes()).padStart(2, '0');
    const seconds = String(ahora.getSeconds()).padStart(2, '0');

    // Agregar log para debug
    console.log(`Próximo bingo programado para: ${hours}:${minutes} (Frecuencia: ${frecuencia})`);

    return {
        fecha: ahora,
        formateada: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    };
};
const calcularTiempoRestante = (horaObjetivo) => {
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const objetivo = new Date(horaObjetivo);
    const diferencia = objetivo - ahora;
    
    const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);
    
    return `${minutos}:${segundos.toString().padStart(2, '0')}`;
};

const generarNumeroUnico = (numerosExistentes) => {
    const numerosUsados = new Set(numerosExistentes);
    if (numerosUsados.size >= 75) return null;

    let numero;
    do {
        numero = Math.floor(Math.random() * 75) + 1;
    } while (numerosUsados.has(numero));
    
    return numero;
};

module.exports = {
    obtenerHoraActual,
    obtenerProximaHora,
    calcularTiempoRestante,
    generarNumeroUnico
};