const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); 
const app = express();
const port = 3000;

app.use(cors()); 
app.use(bodyParser.json());
app.use(express.static('public')); 

// --- SETTINGS ---
let settings = {
    cableLength: 79.0,    
    wellDepth: 110.0,     
    sensorOffset: 0.5,    
    dividerFactor: 1.5,   
    useServerCalc: true
};

let sensorData = {
    rawADC: 0,
    depthToWater: 0,
    status: "WAITING",
    fwVer: "0.0.0",
    lastUpdate: "Never"
};

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
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Error: index.html not found in public folder!');
    }
});

// 2. Receive Data (Fixed for 0 Values)
app.post('/api/data', (req, res) => {
    const raw = req.body;
    
    // FIX: Check for undefined instead of truthy to allow 0
    if (settings.useServerCalc && raw.rawADC !== undefined) {
        
        // Voltage
        const pinVolt = raw.rawADC * (3.3 / 4095.0);
        const actVolt = pinVolt * settings.dividerFactor;
        
        // Pressure (Clamp negative voltage to offset)
        let validVolt = (actVolt < settings.sensorOffset) ? settings.sensorOffset : actVolt;
        const pressMPa = (validVolt - settings.sensorOffset) * 0.4;
        
        // Depth
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
    
    console.log(`Update: ADC=${raw.rawADC} | MPa=${sensorData.pressMPa ? sensorData.pressMPa.toFixed(3) : 0}`);
    res.send('Data Processed');
});

app.get('/api/data', (req, res) => {
    res.json(sensorData);
});

app.get('/api/settings', (req, res) => {
    res.json(settings);
});

app.post('/api/settings', (req, res) => {
    console.log("Settings Updated:", req.body);
    settings = {
        cableLength: parseFloat(req.body.cableLength),
        wellDepth: parseFloat(req.body.wellDepth),
        sensorOffset: parseFloat(req.body.sensorOffset),
        dividerFactor: parseFloat(req.body.dividerFactor),
        useServerCalc: true
    };
    res.json({ success: true, settings: settings });
});

app.post('/upload', upload.single('firmware'), (req, res) => {
    res.redirect('/');
});

app.get('/update', (req, res) => {
    const firmwarePath = path.join(__dirname, 'uploads', 'firmware.bin');
    if (fs.existsSync(firmwarePath)) {
        res.download(firmwarePath, 'firmware.bin');
    } else {
        res.status(404).send('No update');
    }
});

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});