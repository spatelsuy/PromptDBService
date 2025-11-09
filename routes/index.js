import express from 'express';
import dbRoutes from './dbRoutes.js';

const router = express.Router();

// Use different route files
router.use('/db', dbRoutes);        // /api/testdb
//router.use('/', promptRoutes);        // /api/testdb

export default router;
