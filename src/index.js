const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// --- Helpers (very simple auth simulation) ---
function getVoterIdFromHeader(req) {
    // For demo: client sends header 'x-voter-id' representing user id (in Telegram app this will be initData user id)
    return req.headers['x-voter-id'] || null;
}

// --- Routes ---

// Get categories and regions (simple unique lists)
app.get('/api/meta', async (req, res) => {
    const petitions = await prisma.petition.findMany();
    const categories = Array.from(new Set(petitions.map(p => p.category)));
    const regions = Array.from(new Set(petitions.map(p => p.region)));
    res.json({ categories, regions });
});

// List petitions with search + filter + pagination
app.get('/api/petitions', async (req, res) => {
    const { q, category, region, page = 1, perPage = 20 } = req.query;
    const where = {};

    if (q) {
        where.OR = [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { authorName: { contains: q, mode: 'insensitive' } },
        ];
    }
    if (category) where.category = category;
    if (region) where.region = region;

    const skip = (Number(page) - 1) * Number(perPage);
    const petitions = await prisma.petition.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(perPage)
    });
    const total = await prisma.petition.count({ where });
    res.json({ data: petitions, total });
});

// Get single petition
app.get('/api/petitions/:id', async (req, res) => {
    const id = Number(req.params.id);
    const petition = await prisma.petition.findUnique({ where: { id } });
    if (!petition) return res.status(404).json({ error: "Not found" });

    // check if current voter voted (if header provided)
    const voterId = getVoterIdFromHeader(req);
    let voted = false;
    if (voterId) {
        const v = await prisma.vote.findUnique({
            where: { petitionId_voterId: { petitionId: id, voterId } }
        }).catch(()=>null);
        voted = !!v;
    }

    res.json({ petition, voted });
});

// Create petition
app.post('/api/petitions', async (req, res) => {
    const { title, description, category, region, authorName } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'title and description required' });

    const created = await prisma.petition.create({
        data: { title, description, category: category || 'Другое', region: region || 'Не указано', authorName: authorName || 'Аноним' }
    });
    res.status(201).json(created);
});

// Vote for petition (toggle vote disallowed: only add)
app.post('/api/petitions/:id/vote', async (req, res) => {
    const id = Number(req.params.id);
    const voterId = getVoterIdFromHeader(req) || req.body.voterId;
    if (!voterId) return res.status(400).json({ error: 'voter id required in header x-voter-id or body.voterId' });

    // prevent double vote (unique constraint)
    try {
        await prisma.vote.create({ data: { petitionId: id, voterId } });
        await prisma.petition.update({ where: { id }, data: { votes: { increment: 1 } } });
        return res.json({ success: true });
    } catch (e) {
        // unique constraint error or other
        return res.status(400).json({ error: 'You already voted or error', details: e.message });
    }
});

// Simple endpoint to simulate Telegram init (optional)
app.post('/api/auth/telegram', (req, res) => {
    // Accepts {telegramUserId, firstName, username}
    // For prototype we just echo
    res.json({ ok: true, received: req.body });
});

app.listen(PORT, async () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
