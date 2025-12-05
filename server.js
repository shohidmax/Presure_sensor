const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // CORS প্যাকেজ
const app = express();
const port = 3000;

// Middleware
app.use(cors()); // ড্যাশবোর্ড বা প্রিভিউ থেকে অ্যাক্সেস করার জন্য
app.use(bodyParser.json());
app.use(express.static('public')); // 'public' ফোল্ডার স্ট্যাটিক হিসেবে সেট করা

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

// 1. Dashboard Page (Robust Error Handling)
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    
    // ফাইল আছে কিনা চেক করা হচ্ছে
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                <h2 style="color: #e74c3c;">⚠️ Error: index.html not found!</h2>
                <p>The server cannot find the dashboard file.</p>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; display: inline-block; text-align: left;">
                    <p><b>Please ensure your folder structure is correct:</b></p>
                    <pre>
Project_Folder/
├── server.js
├── package.json
└── public/          <-- Create this folder
    └── index.html   <-- Put your HTML file here
                    </pre>
                </div>
                <p style="color: #7f8c8d; font-size: 0.9rem;">Server checked path: ${indexPath}</p>
            </div>
        `);
    }
});

// 2. Receive Data from ESP32
app.post('/api/data', (req, res) => {
    const raw = req.body;
    
    if (settings.useServerCalc && raw.rawADC) {
        // Step 1: Voltage Calculation
        const pinVolt = raw.rawADC * (3.3 / 4095.0);
        const actVolt = pinVolt * settings.dividerFactor;
        
        // Step 2: Pressure Calculation
        let validVolt = (actVolt < settings.sensorOffset) ? settings.sensorOffset : actVolt;
        const pressMPa = (validVolt - settings.sensorOffset) * 0.4;
        
        // Step 3: Depth Calculation
        const waterCol = pressMPa * 334.55;
        let depthToWater = settings.cableLength - waterCol;
        if(depthToWater < 0) depthToWater = 0;
        
        const waterBelow = settings.wellDepth - settings.cableLength;
        const totalWaterHeight = waterBelow + waterCol;
        
        // Update data
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
    
    console.log(`Data Updated: Depth ${sensorData.depthToWater ? sensorData.depthToWater.toFixed(1) : 0} ft | ADC: ${raw.rawADC}`);
    res.send('Data Processed');
});

// 3. Send Data to Frontend
app.get('/api/data', (req, res) => {
    res.json(sensorData);
});

// 4. Get Current Settings
app.get('/api/settings', (req, res) => {
    res.json(settings);
});

// 5. Update Settings (Calibration)
app.post('/api/settings', (req, res) => {
    console.log("Updating Settings:", req.body);
    settings = {
        cableLength: parseFloat(req.body.cableLength),
        wellDepth: parseFloat(req.body.wellDepth),
        sensorOffset: parseFloat(req.body.sensorOffset),
        dividerFactor: parseFloat(req.body.dividerFactor),
        useServerCalc: true
    };
    // Force immediate recalculation log
    if (sensorData.rawADC) {
        console.log("Settings updated. Values will refresh on next data packet.");
    }
    res.json({ success: true, settings: settings });
});

// 6. Upload Firmware
app.post('/upload', upload.single('firmware'), (req, res) => {
    console.log("New Firmware Uploaded Successfully!");
    res.redirect('/');
});

// 7. OTA Endpoint for ESP32
app.get('/update', (req, res) => {
    const firmwarePath = path.join(__dirname, 'uploads', 'firmware.bin');
    if (fs.existsSync(firmwarePath)) {
        res.download(firmwarePath, 'firmware.bin');
    } else {
        res.status(404).send('No firmware update available');
    }
});

// Create uploads folder if missing
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Make sure 'public/index.html' exists!`);
});