const mongoose = require('mongoose');

const downloadSchema = new mongoose.Schema({
    url: { type: String, required: true },
    title: { type: String, required: true },
    format: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Download', downloadSchema);
