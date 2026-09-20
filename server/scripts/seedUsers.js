require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");
const Barangay = require("../models/Barangay");

const accounts = [
    { name: "Maria Santos", email: "maria.santos@email.com", role: "student" },
    { name: "Jose Dela Cruz", email: "jose.delacruz@cityscholar.gov", role: "barangay_staff" },
    { name: "Ana Reyes", email: "ana.reyes@cityscholar.gov", role: "admin_staff" },
];

const barangayNames = [
    "Bacayao Norte",
    "Bacayao Sur",
    "Barangay I (T. Bugallon)",
    "Barangay II (Nueva)",
    "Barangay IV (Zamora)",
    "Bolosan",
    "Bonuan Binloc",
    "Bonuan Boquig",
    "Bonuan Gueset",
    "Calmay",
    "Carael",
    "Caranglaan",
    "Herrero",
    "Lasip Chico",
    "Lasip Grande",
    "Lomboy",
    "Lucao",
    "Malued",
    "Mamalingling",
    "Mangin",
    "Mayombo",
    "Pantal",
    "Pogo Chico",
    "Pogo Grande",
    "Poblacion Oeste",
    "Pugaro Suit",
    "Salapingao",
    "Salisay",
    "Tambac",
    "Tapuac",
    "Tebeng",
];

const renamedBarangays = {
    "Barangay I (Poblacion)": "Barangay I (T. Bugallon)",
    "Barangay II (Poblacion)": "Barangay II (Nueva)",
    "Barangay IV (Poblacion)": "Barangay IV (Zamora)",
};

async function seed() {
    await connectDB();
    for (const [oldName, newName] of Object.entries(renamedBarangays)) {
        await Barangay.updateOne({ name: oldName }, { $set: { name: newName, status: "active" } });
    }
    await Barangay.updateMany({ name: { $nin: barangayNames } }, { $set: { status: "inactive" } });
    const barangays = {};
    for (const name of barangayNames) {
        barangays[name] = await Barangay.findOneAndUpdate({ name }, { name, city: "Dagupan City", province: "Pangasinan", status: "active" }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    const barangay = barangays["Bonuan Boquig"];
    const password = await bcrypt.hash("password123", 10);
    for (const account of accounts) {
        const update = {...account, password };
        if (account.role === "student" || account.role === "barangay_staff") update.barangay = barangay._id;
        await User.findOneAndUpdate({ email: account.email }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    console.log(`${barangayNames.length} barangays and demo accounts seeded. Password: password123`);
    process.exit(0);
}

seed().catch((error) => {
    console.error(error);
    process.exit(1);
});