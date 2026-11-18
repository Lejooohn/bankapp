import express from 'express';
import { createBudgetSchema, updateBudgetSchema } from '@bankapp/shared';
import pool from '../db.js';
import { checkAccountOwnership } from '../lib/shared.js';
import {
  getBudgetsByAccount,
  getBudgetById,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetsWithProgress,
  getBudgetSummary
} from '../services/budgets.js';

const router = express.Router();

// GET /api/accounts/:accountId/budgets - List all budgets for an account
router.get('/accounts/:accountId/budgets', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const accountId = req.params.accountId;
  
  try {
    // Verify account ownership
    const client = await pool.connect();
    try {
      const hasAccess = await checkAccountOwnership(accountId, req.user.id);
      if (!hasAccess) {
        return res.status(404).json({ error: 'Compte introuvable' });
      }
      
      const budgets = await getBudgetsByAccount(accountId, req.user.id);
      res.json(budgets);
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la récupération des budgets' });
  }
});

// GET /api/accounts/:accountId/budgets/summary - Get budget summary
router.get('/accounts/:accountId/budgets/summary', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const accountId = req.params.accountId;
  
  try {
    const client = await pool.connect();
    try {
      const hasAccess = await checkAccountOwnership(accountId, req.user.id);
      if (!hasAccess) {
        return res.status(404).json({ error: 'Compte introuvable' });
      }
      
      const summary = await getBudgetSummary(accountId, req.user.id);
      res.json(summary);
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la récupération du résumé' });
  }
});

// GET /api/accounts/:accountId/budgets/with-progress - List budgets with progress
router.get('/accounts/:accountId/budgets/with-progress', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const accountId = req.params.accountId;
  
  try {
    const client = await pool.connect();
    try {
      const hasAccess = await checkAccountOwnership(accountId, req.user.id);
      if (!hasAccess) {
        return res.status(404).json({ error: 'Compte introuvable' });
      }
      
      const budgets = await getBudgetsWithProgress(accountId, req.user.id);
      res.json(budgets);
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error fetching budgets with progress:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des budgets' });
  }
});

// GET /api/accounts/:accountId/budgets/:budgetId - Get a single budget
router.get('/accounts/:accountId/budgets/:budgetId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const accountId = req.params.accountId;
  const budgetId = req.params.budgetId;
  
  try {
    const client = await pool.connect();
    try {
      const hasAccess = await checkAccountOwnership(accountId, req.user.id);
      if (!hasAccess) {
        return res.status(404).json({ error: 'Compte introuvable' });
      }
      
      const budget = await getBudgetById(budgetId, req.user.id);
      if (!budget) {
        return res.status(404).json({ error: 'Budget introuvable' });
      }
      
      res.json(budget);
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la récupération du budget' });
  }
});

// POST /api/accounts/:accountId/budgets - Create a new budget
router.post('/accounts/:accountId/budgets', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const accountId = req.params.accountId;
  
  try {
    const client = await pool.connect();
    try {
      const hasAccess = await checkAccountOwnership(accountId, req.user.id);
      if (!hasAccess) {
        return res.status(404).json({ error: 'Compte introuvable' });
      }
      
      const parsed = createBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }
      
      const budget = await createBudget({
        ...parsed.data,
        account_id: accountId,
        userId: req.user.id
      });
      
      res.status(201).json(budget);
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error creating budget:', err);
    res.status(500).json({ error: 'Erreur lors de la création du budget' });
  }
});

// PUT /api/accounts/:accountId/budgets/:budgetId - Update a budget
router.put('/accounts/:accountId/budgets/:budgetId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const accountId = req.params.accountId;
  const budgetId = req.params.budgetId;
  
  try {
    const client = await pool.connect();
    try {
      const hasAccess = await checkAccountOwnership(accountId, req.user.id);
      if (!hasAccess) {
        return res.status(404).json({ error: 'Compte introuvable' });
      }
      
      const parsed = updateBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }
      
      const budget = await updateBudget(budgetId, parsed.data, req.user.id);
      if (!budget) {
        return res.status(404).json({ error: 'Budget introuvable' });
      }
      
      res.json(budget);
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error updating budget:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du budget' });
  }
});

// DELETE /api/accounts/:accountId/budgets/:budgetId - Delete a budget
router.delete('/accounts/:accountId/budgets/:budgetId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const accountId = req.params.accountId;
  const budgetId = req.params.budgetId;
  
  try {
    const client = await pool.connect();
    try {
      const hasAccess = await checkAccountOwnership(accountId, req.user.id);
      if (!hasAccess) {
        return res.status(404).json({ error: 'Compte introuvable' });
      }
      
      const success = await deleteBudget(budgetId, req.user.id);
      if (!success) {
        return res.status(404).json({ error: 'Budget introuvable' });
      }
      
      res.json({ success: true });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error deleting budget:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du budget' });
  }
});

export default router;
