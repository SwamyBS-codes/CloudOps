const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const authMiddleware = require('../middleware/authMiddleware');

// List all projects (with environment variables & deployment status)
router.get('/', projectController.listProjects);
// Get project details
router.get('/:id', projectController.getProject);
// Update project (partial updates or environment variables)
router.put('/:id', projectController.updateProject);
// Add or update an environment variable
router.post('/:id/env', projectController.addOrUpdateEnvVariable);
// Delete an environment variable by key
router.delete('/:id/env/:key', projectController.deleteEnvVariable);

module.exports = router;
