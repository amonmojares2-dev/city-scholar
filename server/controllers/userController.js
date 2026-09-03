const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ==========================================
// REGISTER STUDENT
// ==========================================
const registerUser = async(req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check required fields
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and password are required"
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email is already registered"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create student account
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: "student"
        });

        // Response
        res.status(201).json({
            success: true,
            message: "Student account created successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Registration error:", error);

        res.status(500).json({
            success: false,
            message: "Server error during registration"
        });
    }
};


// ==========================================
// LOGIN USER
// ==========================================
const loginUser = async(req, res) => {
    try {
        const { email, password } = req.body;

        // Check required fields
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        // Find user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Check password
        const isPasswordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Create JWT
        const token = jwt.sign({
                id: user._id,
                role: user.role
            },
            process.env.JWT_SECRET, {
                expiresIn: "1d"
            }
        );

        // Response
        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            success: false,
            message: "Server error during login"
        });
    }
};


module.exports = {
    registerUser,
    loginUser
};