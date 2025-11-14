import express from 'express';
import dbRoutes from './dbRoutes.js';
import aiRoutes from './aiRoutes.js';

const router = express.Router();

// Use different route files
router.use('/db', dbRoutes);        // /api/testdb
router.use('/ai', aiRoutes);
//router.use('/', promptRoutes);        // /api/testdb

export default router;
