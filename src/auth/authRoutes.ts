import { Router } from 'express';
import { dbStore } from '../database/store';
import { generateToken, hashPassword } from './authUtils';
import { authenticateToken } from './authMiddleware';

const router = Router();

function normalizePhone(phone?: string) {
  if (!phone) return '';
  return phone.toString().replace(/[^0-9]/g, '');
}

/**
 * Register a new resident
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { name, flatNumber, phone, password } = req.body;

    // Validate input
    if (!name || !flatNumber || !phone || !password) {
      return res.status(400).json({
        error: 'Name, flat number, phone, and password are required'
      });
    }

    // Check if resident already exists (normalize phone)
    const existingResident = dbStore.getResidentProfiles().find(
      r => r.flatNumber === flatNumber && normalizePhone(r.phone) === normalizePhone(phone)
    );

    if (existingResident) {
      return res.status(409).json({
        error: 'Resident with this flat number and phone already exists'
      });
    }

    // Create new resident profile
    const residentId = `RES-${Date.now()}`;
    const hashedPassword = hashPassword(password);
    const accessToken = `TOK-${Date.now().toString().slice(-6)}`;

    const newResident = {
      id: residentId,
      name,
      flatNumber,
      role: 'resident' as const,
      phone,
      email: '', // Optional
      status: 'active' as const,
      accessToken,
      tokensGenerated: 0,
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      // Add password hash (we'll store this separately or extend the type)
      passwordHash: hashedPassword, // This will be stored in our enhanced resident profile
    };

    // Add to resident profiles (we need to enhance dbStore to handle password hash)
    // For now, we'll store it in a separate map or extend the existing array
    // Let's enhance the dbStore to accept password hash

    const createdResident = dbStore.createResidentWithAuth(
      newResident,
      hashedPassword
    );

    // Generate JWT token
    const token = generateToken({
      id: createdResident.id,
      name: createdResident.name,
      flatNumber: createdResident.flatNumber,
      role: createdResident.role,
    });

    res.status(201).json({
      message: 'Resident registered successfully',
      resident: {
        id: createdResident.id,
        name: createdResident.name,
        flatNumber: createdResident.flatNumber,
        role: createdResident.role,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Login resident
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { flatNumber, phone, password } = req.body;

    // Validate input
    if (!flatNumber || !phone || !password) {
      return res.status(400).json({
        error: 'Flat number, phone, and password are required'
      });
    }

    // Find resident by flat number (case-insensitive) and phone.
    // Match phone by full digits or by last-10 digits to tolerate country-code differences.
    const incomingDigits = normalizePhone(phone);
    const incomingLast10 = incomingDigits.slice(-10);

    const resident = dbStore.getResidentProfiles().find((r) => {
      const flatMatches = r.flatNumber?.toString().trim().toLowerCase() === flatNumber.toString().trim().toLowerCase();
      if (!flatMatches) return false;
      const storedDigits = normalizePhone(r.phone);
      const storedLast10 = storedDigits.slice(-10);
      return storedDigits === incomingDigits || storedLast10 === incomingLast10;
    });

    if (!resident) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password (we need to retrieve the stored hash)
    const isValid = dbStore.verifyResidentPassword(
      resident.id,
      password
    );

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = generateToken({
      id: resident.id,
      name: resident.name,
      flatNumber: resident.flatNumber,
      role: resident.role,
    });

    // Update last active time
    dbStore.updateResidentLastActive(resident.id);

    res.json({
      message: 'Login successful',
      resident: {
        id: resident.id,
        name: resident.name,
        flatNumber: resident.flatNumber,
        role: resident.role,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Get full resident profile from store
  const resident = dbStore.getResidentById(req.user.id);
  if (!resident) {
    return res.status(404).json({ error: 'Resident not found' });
  }

  // Remove sensitive information before sending
  const { passwordHash, ...safeResident } = resident as any;

  res.json({
    user: safeResident,
  });
});

export default router;