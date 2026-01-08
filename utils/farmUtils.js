const farmAnimals = require('../json/farm-animals.json');

/**
 * دالة لحساب سعة المزرعة القصوى بناءً على مستوى اللاعب.
 */
function getPlayerCapacity(client, userId, guildId) {
    const userData = client.getLevel.get(userId, guildId) || {};
    const userLevel = userData.level || 0;
    
    if (userLevel <= 5) return 30;
    if (userLevel <= 10) return 80;
    if (userLevel <= 20) return 150;
    if (userLevel <= 30) return 250;
    if (userLevel <= 40) return 350;
    if (userLevel <= 50) return 500;
    if (userLevel <= 60) return 600;
    if (userLevel <= 70) return 700;
    if (userLevel <= 80) return 800;
    return 1000;
}

/**
 * دالة لحساب المساحة المستخدمة حالياً في المزرعة.
 * هذه الدالة تحسب (الكمية × الحجم) لكل الحيوانات وتجمعها.
 */
function getUsedCapacity(sql, userId, guildId) {
    // 1. جلب كل الحيوانات من الداتابيس لهذا الشخص
    const userFarmRows = sql.prepare("SELECT animalID, quantity FROM user_farm WHERE userID = ? AND guildID = ?").all(userId, guildId);
    
    let totalSize = 0;
    
    // 2. الدوران على كل الحيوانات وحساب حجمها
    for (const row of userFarmRows) {
        // ⚠️ تحويل الآيدي لنص لضمان المطابقة 100%
        const animalIdStr = String(row.animalID);
        const animal = farmAnimals.find(a => String(a.id) === animalIdStr);
        
        // الكمية المسجلة (لو مافي كمية نعتبرها 1)
        const qty = row.quantity || 1; 

        if (animal) {
            // الحجم من ملف الجيسون
            const size = animal.size || 1; 
            totalSize += (qty * size);
        } else {
            // لو الحيوان انحذف من الجيسون، نحسب حجمه 1 عشان ما نخرب الحسبة
            totalSize += qty;
        }
    }
    
    return totalSize;
}

module.exports = { getPlayerCapacity, getUsedCapacity };
