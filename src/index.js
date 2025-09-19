const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// --- Helpers ---
function getVoterIdFromHeader(req) {
    return req.headers["x-voter-id"] || req.body.voterId || null;
}

// --- Routes ---

// Get categories and regions
app.get("/api/meta", async (req, res) => {
    try {
        const petitions = await prisma.petition.findMany();
        const categories = Array.from(new Set(petitions.map((p) => p.category).filter(Boolean)));
        const regions = Array.from(new Set(petitions.map((p) => p.region).filter(Boolean)));
        res.json({ categories, regions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch meta" });
    }
});

// List petitions with search + filter + pagination
app.get("/api/petitions", async (req, res) => {
    try {
        const { q, category, region, page = "1", perPage = "20", sort = "createdAt-desc" } = req.query;
        const where = {};

        if (q && q !== "undefined") {
            where.OR = [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { authorName: { contains: q, mode: "insensitive" } },
            ];
        }
        if (category && category !== "undefined") where.category = category;
        if (region && region !== "undefined") where.region = region;

        const skip = (Number(page) - 1) * Number(perPage);
        const take = Number(perPage) || 20;

        const orderBy = {};
        if (sort === "votes-desc") orderBy.votes = "desc";
        else if (sort === "votes-asc") orderBy.votes = "asc";
        else if (sort === "createdAt-desc") orderBy.createdAt = "desc";
        else if (sort === "createdAt-asc") orderBy.createdAt = "asc";
        else orderBy.createdAt = "desc"; // Default

        const petitions = await prisma.petition.findMany({
            where,
            orderBy,
            skip,
            take,
        });
        const total = await prisma.petition.count({ where });

        res.json({ data: petitions, totalPages: Math.ceil(total / take) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch petitions", details: error.message });
    }
});

// Get single petition
app.get("/api/petitions/:id", async (req, res) => {
    try {
        const id = req.params.id; // Assuming id is a string (UUID)
        const petition = await prisma.petition.findUnique({ where: { id } });
        if (!petition) return res.status(404).json({ error: "Petition not found" });

        const voterId = getVoterIdFromHeader(req);
        let voted = false;
        if (voterId) {
            const vote = await prisma.vote
                .findUnique({
                    where: { petitionId_voterId: { petitionId: id, voterId } },
                })
                .catch(() => null);
            voted = !!vote;
        }

        res.json({ petition, voted });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch petition", details: error.message });
    }
});

// Create petition
app.post("/api/petitions", async (req, res) => {
    try {
        const { title, description, category, region, authorName } = req.body;
        if (!title || !description || !authorName) {
            return res.status(400).json({ error: "Title, description, and authorName are required" });
        }

        const created = await prisma.petition.create({
            data: {
                title,
                description,
                category: category || "Другое",
                region: region || "Не указано",
                authorName,
            },
        });
        res.status(201).json(created);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create petition", details: error.message });
    }
});

// Vote for petition
app.post("/api/petitions/:id/vote", async (req, res) => {
    try {
        const id = req.params.id;
        const voterId = getVoterIdFromHeader(req);
        if (!voterId) {
            return res.status(400).json({ error: "Voter ID required in header x-voter-id or body.voterId" });
        }

        const existingVote = await prisma.vote.findUnique({
            where: { petitionId_voterId: { petitionId: id, voterId } },
        });
        if (existingVote) {
            return res.status(400).json({ error: "You already voted" });
        }

        await prisma.vote.create({ data: { petitionId: id, voterId } });
        const updatedPetition = await prisma.petition.update({
            where: { id },
            data: { votes: { increment: 1 } },
        });

        res.json({ success: true, votes: updatedPetition.votes });
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: "Failed to vote", details: error.message });
    }
});

// Simple Telegram auth simulation
app.post("/api/auth/telegram", (req, res) => {
    res.json({ ok: true, received: req.body });
});

app.listen(PORT, async () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});