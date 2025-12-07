// ========================================
// NODE.JS BACKEND - server.js
// Tanpa Login System (Simplified)
// ========================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// PostgreSQL Connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mobilIOT',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Password'
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully');
  }
});

// MQTT Client
const mqttOptions = {
  username: process.env.MQTT_USERNAME || 'mobilIOT',
  password: process.env.MQTT_PASSWORD || 'Password07',
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30000
};

const mqttClient = mqtt.connect(
  process.env.MQTT_BROKER || 'mqtt://localhost:1883',
  mqttOptions
);

mqttClient.on('connect', () => {
  console.log('✅ MQTT Broker connected (HiveMQ Cloud)');
  console.log(`📡 Broker: ${process.env.MQTT_BROKER}`);
  console.log(`👤 User: ${process.env.MQTT_USERNAME}`);
  mqttClient.subscribe('autodrive/telemetry/1');
  mqttClient.subscribe('autodrive/status/1');
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT connection error:', error.message);
  console.log('Check:');
  console.log('1. HiveMQ cluster is running');
  console.log('2. Credentials are correct');
  console.log('3. Internet connection OK');
});

mqttClient.on('reconnect', () => {
  console.log('🔄 MQTT reconnecting to cloud...');
});

mqttClient.on('close', () => {
  console.log('🔌 MQTT disconnected from cloud');
});

// ========================================
// WAYPOINTS ROUTES
// ========================================

// Get all waypoints
app.get('/api/waypoints', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM waypoints ORDER BY created_at DESC'
    );
    res.json({ success: true, waypoints: result.rows });
  } catch (error) {
    console.error('Get waypoints error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create waypoint
app.post('/api/waypoints', async (req, res) => {
  try {
    const { name, x_coordinate, y_coordinate, description } = req.body;
    
    const result = await pool.query(
      'INSERT INTO waypoints (name, x_coordinate, y_coordinate, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, x_coordinate, y_coordinate, description || null]
    );
    
    res.status(201).json({ success: true, waypoint: result.rows[0] });
  } catch (error) {
    console.error('Create waypoint error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update waypoint
app.put('/api/waypoints/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, x_coordinate, y_coordinate, description } = req.body;
    
    const result = await pool.query(
      'UPDATE waypoints SET name = $1, x_coordinate = $2, y_coordinate = $3, description = $4 WHERE id = $5 RETURNING *',
      [name, x_coordinate, y_coordinate, description, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Waypoint not found' });
    }
    
    res.json({ success: true, waypoint: result.rows[0] });
  } catch (error) {
    console.error('Update waypoint error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Delete waypoint
app.delete('/api/waypoints/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM waypoints WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete waypoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// VEHICLE ROUTES
// ========================================

// Get vehicle info
app.get('/api/vehicle', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vehicles WHERE id = 1');
    res.json({ success: true, vehicle: result.rows[0] });
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update vehicle status
app.put('/api/vehicle/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const result = await pool.query(
      'UPDATE vehicles SET status = $1, last_seen = NOW() WHERE id = 1 RETURNING *',
      [status]
    );
    
    res.json({ success: true, vehicle: result.rows[0] });
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// TELEMETRY ROUTES
// ========================================

// Get latest telemetry
app.get('/api/telemetry/latest', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM latest_telemetry');
    res.json({ success: true, telemetry: result.rows[0] || null });
  } catch (error) {
    console.error('Get latest telemetry error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get telemetry history
app.get('/api/telemetry/history', async (req, res) => {
  try {
    const { start_date, end_date, limit = 1000 } = req.query;
    
    let query = 'SELECT * FROM telemetry_history WHERE vehicle_id = 1';
    const params = [];
    
    if (start_date && end_date) {
      query += ' AND timestamp BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json({ success: true, telemetry: result.rows });
  } catch (error) {
    console.error('Get telemetry history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// TRIPS ROUTES
// ========================================

// Get trips history
app.get('/api/trips', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
             w1.name as start_waypoint_name, 
             w2.name as end_waypoint_name
      FROM trips t
      LEFT JOIN waypoints w1 ON t.start_waypoint_id = w1.id
      LEFT JOIN waypoints w2 ON t.end_waypoint_id = w2.id
      WHERE t.vehicle_id = 1
      ORDER BY t.start_time DESC
      LIMIT 50
    `);
    
    res.json({ success: true, trips: result.rows });
  } catch (error) {
    console.error('Get trips error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get active trip
app.get('/api/trips/active', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM active_trip');
    res.json({ success: true, trip: result.rows[0] || null });
  } catch (error) {
    console.error('Get active trip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start trip
app.post('/api/trips', async (req, res) => {
  try {
    const { start_waypoint_id, end_waypoint_id, mode } = req.body;
    
    const result = await pool.query(
      'INSERT INTO trips (vehicle_id, start_waypoint_id, end_waypoint_id, mode) VALUES (1, $1, $2, $3) RETURNING *',
      [start_waypoint_id || null, end_waypoint_id || null, mode || 'manual']
    );
    
    res.status(201).json({ success: true, trip: result.rows[0] });
  } catch (error) {
    console.error('Start trip error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// End trip
app.put('/api/trips/:id/end', async (req, res) => {
  try {
    const { id } = req.params;
    const { distance_traveled, avg_speed, max_speed } = req.body;
    
    const result = await pool.query(`
      UPDATE trips 
      SET 
        end_time = NOW(), 
        status = 'completed',
        distance_traveled = $1,
        avg_speed = $2,
        max_speed = $3,
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - start_time))::INTEGER
      WHERE id = $4 AND vehicle_id = 1
      RETURNING *
    `, [distance_traveled, avg_speed, max_speed, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Trip not found' });
    }
    
    res.json({ success: true, trip: result.rows[0] });
  } catch (error) {
    console.error('End trip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel trip
app.put('/api/trips/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE trips SET status = $1, end_time = NOW() WHERE id = $2 AND vehicle_id = 1 RETURNING *',
      ['cancelled', id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Trip not found' });
    }
    
    res.json({ success: true, trip: result.rows[0] });
  } catch (error) {
    console.error('Cancel trip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// CONTROL ROUTES (ESP32 Commands)
// ========================================

// Send command to ESP32
app.post('/api/control/command', async (req, res) => {
  try {
    const { command, data } = req.body;
    
    const topic = 'autodrive/control/1';
    const payload = JSON.stringify({ 
      command, 
      data: data || {}, 
      timestamp: Date.now() 
    });
    
    mqttClient.publish(topic, payload);
    
    console.log(`Command sent: ${command}`, data);
    res.json({ success: true, message: 'Command sent' });
  } catch (error) {
    console.error('Send command error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// ANALYTICS ROUTES
// ========================================

// Get dashboard statistics
app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    const stats = await pool.query('SELECT * FROM trip_statistics');
    const latestTelemetry = await pool.query('SELECT * FROM latest_telemetry');
    const vehicle = await pool.query('SELECT * FROM vehicles WHERE id = 1');
    const waypointsCount = await pool.query('SELECT COUNT(*) FROM waypoints');
    
    res.json({
      success: true,
      stats: {
        trip_statistics: stats.rows[0],
        latest_telemetry: latestTelemetry.rows[0],
        vehicle_status: vehicle.rows[0],
        total_waypoints: parseInt(waypointsCount.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// WEBSOCKET - Real-time Communication
// ========================================

wss.on('connection', (ws, req) => {
  console.log('🔌 WebSocket client connected');
  
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  // Send current status on connect
  pool.query('SELECT * FROM latest_telemetry')
    .then(result => {
      if (result.rows[0]) {
        ws.send(JSON.stringify({ 
          type: 'telemetry', 
          data: result.rows[0] 
        }));
      }
    })
    .catch(err => console.error('Initial telemetry error:', err));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'control') {
        // Forward control to ESP32 via MQTT
        mqttClient.publish(
          'autodrive/control/1',
          JSON.stringify(data.payload)
        );
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
  });
});

// Heartbeat to keep connections alive
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// ========================================
// MQTT - Handle ESP32 Messages
// ========================================

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    
    // Save telemetry to database
    if (topic === 'autodrive/telemetry/1') {
      await pool.query(
        `INSERT INTO telemetry_history 
        (vehicle_id, speed, x_position, y_position, heading, distance_front, distance_left, distance_right) 
        VALUES (1, $1, $2, $3, $4, $5, $6, $7)`,
        [
          data.speed || 0,
          data.x || 0,
          data.y || 0,
          data.heading || 0,
          data.distFront || 0,
          data.distLeft || 0,
          data.distRight || 0
        ]
      );
      
      // Update vehicle status
      await pool.query(
        'UPDATE vehicles SET last_seen = NOW(), status = $1 WHERE id = 1',
        ['online']
      );
      
      // Broadcast to WebSocket clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            type: 'telemetry', 
            data: data 
          }));
        }
      });
    }
    
    // Handle status updates
    if (topic === 'autodrive/status/1') {
      await pool.query(
        'UPDATE vehicles SET status = $1, last_seen = NOW() WHERE id = 1',
        [data.status]
      );
      
      // Broadcast status to WebSocket
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            type: 'status', 
            data: data 
          }));
        }
      });
    }
  } catch (error) {
    console.error('MQTT message error:', error);
  }
});

// ========================================
// ROOT ROUTE
// ========================================

app.get('/', (req, res) => {
  res.json({
    message: 'Auto Drive Navigation API',
    version: '1.0.0',
    endpoints: {
      waypoints: '/api/waypoints',
      vehicle: '/api/vehicle',
      telemetry: '/api/telemetry/latest',
      trips: '/api/trips',
      control: '/api/control/command',
      analytics: '/api/analytics/dashboard'
    }
  });
});

// ========================================
// ERROR HANDLING
// ========================================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// ========================================
// START SERVER
// ========================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🗄️  Database: ${process.env.DB_NAME}`);
  console.log(`🔌 MQTT: ${process.env.MQTT_BROKER}`);
  console.log('========================================');
  console.log(`API: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log('========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    pool.end();
    mqttClient.end();
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  server.close(() => {
    pool.end();
    mqttClient.end();
    console.log('HTTP server closed');
    process.exit(0);
  });
});