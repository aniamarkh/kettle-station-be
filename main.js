var http = require('http');
var ws = require('websocket').server;
var fs = require('fs');
var path = require('path');

var sleep;
import('sleep-synchronously').then(s => {
    sleep = s.default;
});

server = http.createServer(function (request, response) {
    console.log('request starting...');

    var filePath = './web' + request.url;
    if (filePath == './web/')
        filePath = './web/index.html';

    var extname = path.extname(filePath);
    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;      
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.wav':
            contentType = 'audio/wav';
            break;
        case '.svg':
            contentType = 'image/svg+xml';
            break;
    }

    fs.readFile(filePath, function(error, content) {
        if (error) {
            if(error.code == 'ENOENT'){
                response.writeHead(404);
                response.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
            }
            else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
            }
        }
        else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });

}).listen(8000);

var websocketServer = new ws({ httpServer: server });

// const led_status = {
//     led_power: 0,
//     led_70: 0,
//     led_80: 0,
//     led_keepwarm: 0,
//     led_90: 0,
//     led_100: 0
// }

class TemperatureSystem {
    constructor() {
        this.temperatureStatus = {
            led_power: 0,
            led_70: 0,
            led_80: 0,
            led_90: 0,
            led_100: 0,
            led_keepwarm: 0,
        };
        this.currentTemperature = 0;
    }

    increaseTemperature() {
        if (this.currentTemperature < 100) {
            if (this.currentTemperature === 0) {
                this.currentTemperature = 70;
            } else {
                this.currentTemperature += 10;
            }
            this.updateLEDStatus();
        } else {
            console.log("Temperature cannot be increased above 100.");
        }
    }
    
    decreaseTemperature() {
        if (this.currentTemperature > 70) {
            this.currentTemperature -= 10;
            this.updateLEDStatus();
        } else if (this.currentTemperature === 70) {
            this.currentTemperature = 0;
            this.updateLEDStatus();
        } else {
            console.log("Temperature cannot be decreased below 0.");
        }
    }

    updateLEDStatus() {
        this.temperatureStatus = {
            led_power: this.temperatureStatus.led_power,
            led_70: this.currentTemperature >= 70 ? 1 : 0,
            led_80: this.currentTemperature >= 80 ? 1 : 0,
            led_90: this.currentTemperature >= 90 ? 1 : 0,
            led_100: this.currentTemperature >= 100 ? 1 : 0,
            led_keepwarm: this.temperatureStatus.led_keepwarm,
        };
    }
}

const led_status = new TemperatureSystem();


const open_sockets = new Set();

websocketServer.on('request', function(request) {    
    var connection = request.accept(null, request.origin);
    open_sockets.add(connection);

    console.log((new Date()) + ' Connection accepted.');

    connection.send_and_log = (obj) => {
        const msg = JSON.stringify(obj);
        console.log('sending: ' + msg);
        connection.sendUTF(msg);
    }

    connection.send_and_log({t:'status', d:led_status.temperatureStatus});
    connection.send_and_log({t: 'challenge', d: ''});


    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log('Received Message: ' + message.utf8Data);

            var message_object = JSON.parse(message.utf8Data);
            try {
                if (message_object.o === 'button_press') {
                    sleep(1000);

                    switch (message_object.d) {
                        case 0:
                            led_status.temperatureStatus.led_power = led_status.temperatureStatus.led_power ? 0 : 1;
                            break;
                        case 3:
                            led_status.temperatureStatus.led_keepwarm = led_status.temperatureStatus.led_keepwarm ? 0 : 1;
                            break;
                        case 1: 
                            led_status.decreaseTemperature();
                            break;
                        case 2:
                            led_status.increaseTemperature();
                            break;
                    };
                    
                    connection.send_and_log({t:'response', d:'ok', i: message_object.i});
                    for (const socket of open_sockets) {
                        socket.send_and_log({t:'status', d:led_status.temperatureStatus});
                    }
                } else if (message_object.o === 'challenge') {
                    sleep(1000);
                    if (message_object.d === 'de0086e9a4b730437e29d4912485a1f62e343ba5b1b4701de4efe9bf5ad3fa84') {
                        connection.send_and_log({t: 'response', d: true, i: message_object.i});
                    } else {
                        connection.send_and_log({t: 'response', d: false, i: message_object.i});
                    }
                } else if (message_object.o === 'ping') {
                    connection.send_and_log({t: 'response', d: 'pong', i: message_object.i});
                }
            } catch (error) {
                console.log('catch error ', error.message);
                connection.send_and_log({t:'response', e:error, i: message_object.i});
            }

        }
        else if (message.type === 'binary') {
            console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
            connection.close();
        }
    });

    connection.on('close', function(reasonCode, description) {
        open_sockets.delete(connection);
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});

console.log('Server running at http://+:8000/');

// setInterval(() => {
//     let random = Math.floor(Math.random() * (1 << 6));

//     console.log('new random is ' + random);

//     for (const led in led_status) {
//         led_status[led] = random & 0x1;
//         random >>= 1;
//     }

//     for (const socket of open_sockets) {
//         socket.send_and_log({t:'status', d:led_status});
//     }
// }, 20000);
