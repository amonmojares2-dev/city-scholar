const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getStudentApplication,
  createStudentApplication,
  updateStudentApplication,
  submitStudentApplication,
} = require('../controllers/studentApplicationController');

const router = express.Router();
router.use(protect);

router.get('/', getStudentApplication);
router.post('/', createStudentApplication);
router.patch('/', updateStudentApplication);
router.patch('/submit', submitStudentApplication);

module.exports = router;
