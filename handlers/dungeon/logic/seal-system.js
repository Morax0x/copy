// handlers/dungeon/logic/seal-system.js

/**
 * دالة لحساب الحدود القصوى (Caps) بناءً على الطابق الحالي
 * تعيد كائناً يحتوي على: أقصى دمج ثابت، وأقصى لفل مسموح
 */
function getFloorCaps(floor) {
    let damageCap = Infinity; // دمج غير محدود افتراضياً
    let levelCap = 30;        // أقصى لفل ممكن افتراضياً (للطوابق العليا 51+)

    // 1. الطوابق الدنيا (الختم المطلق للدمج)
    if (floor >= 1 && floor <= 5) {
        damageCap = 50;
    } 
    else if (floor >= 6 && floor <= 10) {
        damageCap = 90;
    }
    else if (floor >= 11 && floor <= 14) {
        damageCap = 120;
    }
    
    // 2. مرحلة فك الختم الجزئي (تقييد المستوى)
    // من طابق 15 إلى 18: يسمح بدمج حر لكن بحد أقصى لفل 10
    else if (floor >= 15 && floor <= 18) {
        levelCap = 10;
    }

    // 3. مرحلة فك الختم المتوسط (تقييد المستوى)
    // من طابق 19 إلى 50: يسمح بدمج حر لكن بحد أقصى لفل 20
    else if (floor >= 19 && floor <= 50) {
        levelCap = 20;
    }

    // 4. ما بعد الطابق 50: (اعتراف الإمبراطور)
    // لفل 30 (أو أقصى ما يملكه اللاعب)
    else {
        levelCap = 30; 
    }

    return { damageCap, levelCap };
}

/**
 * التحقق من رسائل القصة (Story Telling)
 * (لا تؤثر على الأرقام، فقط لإبلاغ اللاعب بما يحدث)
 */
async function checkSealMessages(floor, players, threadChannel) {
    // رسالة البداية
    if (floor === 1) {
        players.forEach(p => {
            threadChannel.send(`✶ <@${p.id}> تـم ختـم قوتك! لن تتمكن من تجاوز حدود معينة للدمج مهما كانت قوتك.`).catch(() => {});
        });
    }

    // رسالة فك الختم الجزئي (لفل 10)
    if (floor === 15) {
        players.forEach(p => {
            if (!p.isDead) { 
                threadChannel.send(`✶ <@${p.id}> كسرت الختم بشكل جزئي.. يمكنك الآن استخدام قوتك حتى (Level 10)!`).catch(() => {});
            }
        });
    }
    
    // رسالة فك الختم المتوسط (لفل 20)
    if (floor === 19) {
        players.forEach(p => {
            if (!p.isDead) { 
                threadChannel.send(`✶ <@${p.id}> تـم كـسـر الخـتم وأطلق العنان لقوتك حتى (Level 20)!`).catch(() => {});
            }
        });
    }
}

module.exports = { getFloorCaps, checkSealMessages };
