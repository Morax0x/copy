const { getSmartTarget, applyDamageToPlayer } = require('./utils');

const GENERIC_MONSTER_SKILLS = [
    { name: "ضربة قاصمة", emoji: "🔨", chance: 0.3, execute: (m, p, l) => { 
        const target = getSmartTarget(p);
        if(target){ applyDamageToPlayer(target, Math.floor(m.atk * 1.5)); l.push(`🔨 **${m.name}** رصد نقطة ضعف **${target.name}** وسدد ضربة قاصمة!`); }
    }},
    { name: "عضة سامة", emoji: "🤮", chance: 0.3, execute: (m, p, l) => { 
        const target = p.filter(pl=>!pl.isDead)[Math.floor(Math.random()*p.filter(pl=>!pl.isDead).length)];
        if(target){ target.effects.push({type:'poison', val: Math.floor(m.atk*0.2), turns:3}); l.push(`🤮 **${m.name}** نفث سماً على **${target.name}**!`); }
    }},
    { name: "صرخة مرعبة", emoji: "🗣️", chance: 0.2, execute: (m, p, l) => { 
        p.forEach(pl=>{if(!pl.isDead && Math.random()<0.5) pl.effects.push({type:'weakness',val:0.3,turns:2})}); l.push(`🗣️ **${m.name}** أطلق صرخة أضعفت عزيمة البعض!`);
    }},
    { name: "هجوم متوحش", emoji: "🐾", chance: 0.3, execute: (m, p, l) => { 
        p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.8))}); l.push(`🐾 **${m.name}** هاجم الجميع بوحشية!`);
    }},
    { name: "تصلب", emoji: "🛡️", chance: 0.2, execute: (m, p, l) => { 
        m.hp += Math.floor(m.maxHp * 0.05); l.push(`🛡️ **${m.name}** زاد دفاعه واستعاد قليلاً من الصحة!`);
    }}
];

const MONSTER_SKILLS = {
    // ... (انسخ نفس كائن MONSTER_SKILLS الكبير من الكود الأصلي بالكامل هنا) ...
    // ... لتوفير المساحة، تأكد من نسخ كل الوحوش من الكود الأصلي ...
    "مالينيا، نصل ميكيلا": {
        name: "رقصة الموت (Dance of Death)",
        emoji: "🌸",
        chance: 0.25,
        execute: (monster, players, log) => {
            let totalDmg = 0;
            players.forEach(p => {
                if (!p.isDead) {
                    const dmg = Math.floor(monster.atk * 1.5);
                    const actualDmg = applyDamageToPlayer(p, dmg);
                    totalDmg += actualDmg;
                    monster.hp = Math.min(monster.maxHp, monster.hp + Math.floor(actualDmg * 0.5));
                }
            });
            log.push(`🌸 **مالينيا** حلقت ونفذت **رقصة الموت**! (امتصاص صحة الفريق)`);
        }
    },
    // ... باقي الزعماء (نفس الكود الأصلي بالضبط) ...
    "حارس الجحيم الأزلي": { name: "نفس اللهب", emoji: "🔥", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'burn',val:Math.floor(m.atk*0.2),turns:3})}); l.push(`🔥 **الحارس** نفث نيران الجحيم!`); } }
};

module.exports = { GENERIC_MONSTER_SKILLS, MONSTER_SKILLS };
