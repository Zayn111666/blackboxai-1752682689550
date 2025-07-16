const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'melooha-kaal-chakr-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Serve static files
app.use(express.static('public'));

// Helper function to read JSON files
async function readJSONFile(filename) {
    try {
        const data = await fs.readFile(path.join(__dirname, 'data', filename), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filename}:`, error);
        return [];
    }
}

// Helper function to write JSON files
async function writeJSONFile(filename, data) {
    try {
        await fs.writeFile(
            path.join(__dirname, 'data', filename), 
            JSON.stringify(data, null, 2)
        );
        return true;
    } catch (error) {
        console.error(`Error writing ${filename}:`, error);
        return false;
    }
}

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
};

// Admin authentication middleware
const requireAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

// API Routes

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, fullName } = req.body;
        
        if (!username || !email || !password || !fullName) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const users = await readJSONFile('users.json');
        
        // Check if user already exists
        if (users.find(u => u.username === username || u.email === email)) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            fullName,
            password: hashedPassword,
            isAdmin: false,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        await writeJSONFile('users.json', users);

        res.json({ message: 'User registered successfully', userId: newUser.id });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const users = await readJSONFile('users.json');
        const user = users.find(u => u.username === username || u.email === username);

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = user.isAdmin;

        res.json({ 
            message: 'Login successful', 
            user: { 
                id: user.id, 
                username: user.username, 
                fullName: user.fullName,
                isAdmin: user.isAdmin 
            } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

// Get current user session
app.get('/api/user', (req, res) => {
    if (req.session.userId) {
        res.json({
            id: req.session.userId,
            username: req.session.username,
            isAdmin: req.session.isAdmin
        });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// Get testimonials
app.get('/api/testimonials', async (req, res) => {
    try {
        const testimonials = await readJSONFile('testimonials.json');
        res.json(testimonials);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load testimonials' });
    }
});

// Get community comments (requires authentication)
app.get('/api/comments', requireAuth, async (req, res) => {
    try {
        const comments = await readJSONFile('comments.json');
        res.json(comments);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load comments' });
    }
});

// Add community comment (requires authentication)
app.post('/api/comments', requireAuth, async (req, res) => {
    try {
        const { comment } = req.body;
        
        if (!comment || comment.trim().length === 0) {
            return res.status(400).json({ error: 'Comment is required' });
        }

        const comments = await readJSONFile('comments.json');
        const newComment = {
            id: Date.now().toString(),
            username: req.session.username,
            comment: comment.trim(),
            date: new Date().toISOString(),
            likes: 0
        };

        comments.unshift(newComment); // Add to beginning
        await writeJSONFile('comments.json', comments);

        res.json({ message: 'Comment added successfully', comment: newComment });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// Get blogs
app.get('/api/blogs', async (req, res) => {
    try {
        const blogs = await readJSONFile('blogs.json');
        res.json(blogs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load blogs' });
    }
});

// Admin: Add testimonial
app.post('/api/admin/testimonials', requireAdmin, async (req, res) => {
    try {
        const { name, location, rating, comment, imageUrl } = req.body;
        
        const testimonials = await readJSONFile('testimonials.json');
        const newTestimonial = {
            id: Date.now().toString(),
            name,
            location,
            rating: parseInt(rating),
            comment,
            imageUrl: imageUrl || '',
            date: new Date().toISOString()
        };

        testimonials.unshift(newTestimonial);
        await writeJSONFile('testimonials.json', testimonials);

        res.json({ message: 'Testimonial added successfully', testimonial: newTestimonial });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add testimonial' });
    }
});

// Admin: Delete comment
app.delete('/api/admin/comments/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const comments = await readJSONFile('comments.json');
        const filteredComments = comments.filter(c => c.id !== id);
        
        await writeJSONFile('comments.json', filteredComments);
        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Melooha Enhanced Server running on http://localhost:${PORT}`);
    console.log(`📱 Access the website at http://localhost:${PORT}`);
});
