const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); // 'public' folder e html thakbe

// Variable to store latest sensor data
let sensorData = {
    depthToWater: 0,
    waterCol: 0,
    waterBelow: 0,
    status: "WAITING",
    fwVer: "0.0.0",
    lastUpdate: "Never"
};

// Firmware Upload Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/') // Make sure this folder exists
    },
    filename: function (req, file, cb) {
        cb(null, 'firmware.bin') // Always save as firmware.bin
    }
});
const upload = multer({ storage: storage });

// --- ROUTES ---

// 1. Dashboard Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. Receive Data from ESP32 (POST)
app.post('/api/data', (req, res) => {
    console.log('Received Data:', req.body);
    sensorData = req.body;
    sensorData.lastUpdate = new Date().toLocaleTimeString();
    res.send('Data Received');
});

// 3. Send Data to Frontend (GET)
app.get('/api/data', (req, res) => {
    res.json(sensorData);
});

// 4. Upload Firmware (Admin Panel)
app.post('/upload', upload.single('firmware'), (req, res) => {
    console.log("New Firmware Uploaded!");
    res.redirect('/');
});

// 5. ESP32 OTA Update Endpoint
app.get('/update', (req, res) => {
    const firmwarePath = path.join(__dirname, 'uploads', 'firmware.bin');
    
    // Check if firmware file exists
    if (fs.existsSync(firmwarePath)) {
        console.log("ESP32 requesting update...");
        res.download(firmwarePath, 'firmware.bin', (err) => {
            if (err) {
                console.error("Error downloading firmware:", err);
            }
        });
    } else {
        res.status(404).send('No firmware update available');
    }
});

// Create uploads folder if not exists
if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`For ESP32, use your PC IP address: http://YOUR_PC_IP:${port}`);
});