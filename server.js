const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // New Package
const app = express();
const port = 3000;

// Middleware
app.use(cors()); // Enable CORS for remote access (Dashboard/Preview)
app.use(bodyParser.json());
app.use(express.static('public')); 

// --- CALIBRATION SETTINGS (Default) ---
let settings = {
    cableLength: 79.0,    // ft
    wellDepth: 110.0,     // ft
    sensorOffset: 0.5,    // v
    dividerFactor: 1.5,   // ratio
    useServerCalc: true
};

// Store latest sensor data
let sensorData = {
    rawADC: 0,
    depthToWater: 0,
    status: "WAITING",
    fwVer: "0.0.0",
    lastUpdate: "Never"
};

// Firmware Upload Config
const storage = multer.diskStorage({
    destination: function (req, file, cb) { 
        if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
        cb(null, './uploads/') 
    },
    filename: function (req, file, cb) { cb(null, 'firmware.bin') }
});
const upload = multer({ storage: storage });

// --- ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. Receive Data from ESP32
app.post('/api/data', (req, res) => {
    const raw = req.body;
    
    if (settings.useServerCalc && raw.rawADC) {
        // Step 1: Voltage
        const pinVolt = raw.rawADC * (3.3 / 4095.0);
        const actVolt = pinVolt * settings.dividerFactor;
        
        // Step 2: Pressure
        let validVolt = (actVolt < settings.sensorOffset) ? settings.sensorOffset : actVolt;
        const pressMPa = (validVolt - settings.sensorOffset) * 0.4;
        
        // Step 3: Depth
        const waterCol = pressMPa * 334.55;
        let depthToWater = settings.cableLength - waterCol;
        if(depthToWater < 0) depthToWater = 0;
        
        const waterBelow = settings.wellDepth - settings.cableLength;
        const totalWaterHeight = waterBelow + waterCol;
        
        sensorData = {
            ...raw,
            actVolt: actVolt,
            pressMPa: pressMPa,
            waterCol: waterCol,
            depthToWater: depthToWater,
            waterBelow: waterBelow,
            totalWaterHeight: totalWaterHeight,
            calibratedWith: settings 
        };
    } else {
        sensorData = raw;
    }

    sensorData.lastUpdate = new Date().toLocaleTimeString();
    sensorData.status = (sensorData.depthToWater > 80) ? "LOW" : "NORMAL";
    
    console.log(`Data Updated: Depth ${sensorData.depthToWater ? sensorData.depthToWater.toFixed(1) : 0} ft`);
    res.send('Data Processed');
});

// 2. Send Data to Frontend
app.get('/api/data', (req, res) => {
    res.json(sensorData);
});

// 3. Get Settings
app.get('/api/settings', (req, res) => {
    res.json(settings);
});

// 4. Update Settings
app.post('/api/settings', (req, res) => {
    console.log("New Settings:", req.body);
    settings = {
        cableLength: parseFloat(req.body.cableLength),
        wellDepth: parseFloat(req.body.wellDepth),
        sensorOffset: parseFloat(req.body.sensorOffset),
        dividerFactor: parseFloat(req.body.dividerFactor),
        useServerCalc: true
    };
    res.json({ success: true, settings: settings });
});

// 5. Upload Firmware
app.post('/upload', upload.single('firmware'), (req, res) => {
    console.log("New Firmware Uploaded!");
    res.redirect('/');
});

// 6. OTA Endpoint
app.get('/update', (req, res) => {
    const firmwarePath = path.join(__dirname, 'uploads', 'firmware.bin');
    if (fs.existsSync(firmwarePath)) {
        res.download(firmwarePath, 'firmware.bin');
    } else {
        res.status(404).send('No update');
    }
});

// Ensure uploads directory
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});