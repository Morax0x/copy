const { getSmartTarget, applyDamageToPlayer } = require('./utils');

// --- ⚔️ مهارات الوحوش العامة (للمينيون والنخبة) ---
const GENERIC_MONSTER_SKILLS = [
    { 
        name: "ضربة قاصمة", emoji: "🔨", chance: 0.3, 
        execute: (m, p, l) => { 
            const target = getSmartTarget(p);
            if(target){ 
                applyDamageToPlayer(target, Math.floor(m.atk * 1.5)); 
                l.push(`🔨 **${m.name}** رصد نقطة ضعف **${target.name}** وسدد ضربة قاصمة!`); 
            }
        }
    },
    { 
        name: "عضة سامة", emoji: "🤮", chance: 0.3, 
        execute: (m, p, l) => { 
            const target = p.filter(pl=>!pl.isDead)[Math.floor(Math.random()*p.filter(pl=>!pl.isDead).length)];
            if(target){ 
                target.effects.push({type:'poison', val: Math.floor(m.atk*0.2), turns:3}); 
                l.push(`🤮 **${m.name}** نفث سماً على **${target.name}**!`); 
            }
        }
    },
    { 
        name: "صرخة مرعبة", emoji: "🗣️", chance: 0.2, 
        execute: (m, p, l) => { 
            p.forEach(pl=>{
                if(!pl.isDead && Math.random()<0.5) pl.effects.push({type:'weakness',val:0.3,turns:2});
            }); 
            l.push(`🗣️ **${m.name}** أطلق صرخة أضعفت عزيمة البعض!`);
        }
    },
    { 
        name: "هجوم متوحش", emoji: "🐾", chance: 0.3, 
        execute: (m, p, l) => { 
            p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.8))}); 
            l.push(`🐾 **${m.name}** هاجم الجميع بوحشية!`);
        }
    },
    { 
        name: "تصلب", emoji: "🛡️", chance: 0.2, 
        execute: (m, p, l) => { 
            m.hp += Math.floor(m.maxHp * 0.05); 
            l.push(`🛡️ **${m.name}** زاد دفاعه واستعاد قليلاً من الصحة!`);
        }
    }
];

// --- 👹 قاعدة بيانات مهارات الزعماء والحراس (شاملة) ---
const MONSTER_SKILLS = {
    // ====================================================
    // 💀 Elden Ring & Dark Souls Bosses
    // ====================================================
    "مالينيا، نصل ميكيلا": {
        name: "رقصة الموت (Waterfowl Dance)",
        emoji: "🌸", chance: 0.25,
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
    "الجنرال رادان": {
        name: "نجمة القهر",
        emoji: "☄️", chance: 0.20,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if (target) {
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.5));
                target.effects.push({ type: 'weakness', val: 0.5, turns: 2 });
                log.push(`☄️ **رادان** سحق **${target.name}** بقوة النجوم!`);
            }
        }
    },
    "ماليكيث، النصل الأسود": {
        name: "الموت المقدر",
        emoji: "🗡️", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { 
                if (!p.isDead) { 
                    p.hp -= Math.floor(p.hp * 0.20); 
                    p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.2), turns: 3 }); 
                } 
            });
            log.push(`🗡️ **ماليكيث** أطلق العنان للموت المقدر! (HP Cut + Burn)`);
        }
    },
    "غودفري، الإلدن لورد": {
        name: "زلزال هورا لوكس",
        emoji: "🌋", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { 
                if (!p.isDead) { 
                    applyDamageToPlayer(p, Math.floor(monster.atk * 0.9)); 
                    if (Math.random() < 0.5) p.skipCount = (p.skipCount || 0) + 1; 
                } 
            });
            log.push(`🌋 **غودفري** مزق الأرض! (ضرر + إسقاط)`);
        }
    },
    "الساحرة راني": {
        name: "قمر الظلام البارد",
        emoji: "🌕", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { 
                if(!p.isDead) { 
                    applyDamageToPlayer(p, monster.atk); 
                    p.effects.push({type:'weakness', val:0.3, turns:2}); 
                } 
            });
            log.push(`🌕 **راني** أطلقت سحر القمر المظلم! (تجميد/ضعف)`);
        }
    },
    "أرتورياس، سائر الهاوية": {
        name: "شقلبة الهاوية",
        emoji: "🤸", chance: 0.30,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.8)); 
                monster.atk = Math.floor(monster.atk * 1.1); 
                log.push(`🌑 **أرتورياس** سحق **${target.name}** وازداد غضباً!`); 
            }
        }
    },
    "النامليس كينج": {
        name: "عاصفة الرعد",
        emoji: "🌩️", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.1)); });
            log.push(`🌩️ **الملك المجهول** استدعى العاصفة!`);
        }
    },
    "سول أوف سيندر": {
        name: "كومبو السيف الملتوي",
        emoji: "🔥", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); 
                target.effects.push({type:'burn', val: Math.floor(monster.atk*0.3), turns:2}); 
                log.push(`🔥 **روح الرماد** أحرق **${target.name}**!`); 
            }
        }
    },
    "مانوس أبو الهاوية": {
        name: "وابل الظلام (Dark Bead)",
        emoji: "⚫", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { 
                if (!p.isDead) { 
                    applyDamageToPlayer(p, Math.floor(monster.atk * 1.6)); 
                    p.effects.push({ type: 'blind', val: 0.5, turns: 2 }); 
                } 
            });
            log.push(`⚫ **مانوس** أطلق سحر **وابل الظلام**! (ضرر + عمى)`);
        }
    },
    "إيشين قديس السيف": {
        name: "تقنية البرق",
        emoji: "⚡", chance: 0.30,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.2)); 
                log.push(`⚡ **إيشين** صعق **${target.name}** بالبرق!`); 
            }
        }
    },

    // ====================================================
    // 🎮 Other Games Bosses (FF, DMC, WoW, GoW)
    // ====================================================
    "سيفيروث": {
        name: "سوبر نوفا",
        emoji: "🌌", chance: 0.15,
        execute: (monster, players, log) => {
            players.forEach(p => { 
                if (!p.isDead) { 
                    const dmg = Math.floor(p.hp * 0.5); 
                    applyDamageToPlayer(p, dmg); 
                    p.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); 
                } 
            });
            log.push(`🌌 **سيفيروث** دمر النظام الشمسي بـ **سوبر نوفا**! (HP -50%)`);
        }
    },
    "الملك تيرانيوس": {
        name: "زئير مرعب",
        emoji: "🦖", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead && Math.random()<0.5) p.skipCount = (p.skipCount||0)+1; });
            log.push(`🦖 **تيرانيوس** زأر بقوة مرعبة! (إلغاء أدوار)`);
        }
    },
    "إليدان ستورمريج": {
        name: "أشعة العين (Eye Beam)",
        emoji: "🟢", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.2)); });
            log.push(`🟢 **إليدان** أحرق الجميع بأشعة الفيل!`);
        }
    },
    "آرثاس، الليتش كينج": {
        name: "غضب فروستمورن",
        emoji: "❄️", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); 
                target.effects.push({ type: 'weakness', val: 0.5, turns: 3 }); 
                log.push(`❄️ **آرثاس** جمد روح **${target.name}**!`); 
            }
        }
    },
    "ديث وينج المدمر": {
        name: "كتاكليزم",
        emoji: "🔥", chance: 0.10,
        execute: (monster, players, log) => {
            players.forEach(p => { 
                if(!p.isDead) { 
                    applyDamageToPlayer(p, Math.floor(monster.atk * 2)); 
                    p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.3), turns: 5 }); 
                } 
            });
            log.push(`🔥 **ديث وينج** أحرق العالم! (ضرر هائل + حرق)`);
        }
    },
    "ديابلو سيد الرعب": {
        name: "برق الجحيم الأحمر",
        emoji: "🔴", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { 
                if(!p.isDead) { 
                    applyDamageToPlayer(p, monster.atk); 
                    p.effects.push({type:'confusion', val:0.3, turns:2}); 
                } 
            });
            log.push(`🔴 **ديابلو** بث الرعب في القلوب!`);
        }
    },
    "باعل سيد الدمار": {
        name: "نسخة الظل",
        emoji: "👥", chance: 0.20,
        execute: (monster, players, log) => {
            monster.effects.push({ type: 'evasion', val: 0.5, turns: 2 }); 
            log.push(`👥 **باعل** استدعى نسخة، مما جعل إصابته صعبة!`);
        }
    },
    "ميفيستو سيد الكراهية": {
        name: "نوفا السموم",
        emoji: "☠️", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) p.effects.push({type:'poison', val: Math.floor(monster.atk*0.4), turns:3}); });
            log.push(`☠️ **ميفيستو** أطلق موجة سموم قاتلة!`);
        }
    },
    "فيرجل، العاصفة المقتربة": {
        name: "Judgment Cut End",
        emoji: "⚔️", chance: 0.20,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.3)); });
            log.push(`⚔️ **فيرجل** قطع الزمان والمكان!`);
        }
    },
    "دانتي صائد الشياطين": {
        name: "Devil Trigger",
        emoji: "😈", chance: 0.20,
        execute: (monster, players, log) => {
            monster.hp = Math.min(monster.maxHp, monster.hp + Math.floor(monster.maxHp * 0.15));
            monster.atk = Math.floor(monster.atk * 1.25);
            log.push(`😈 **دانتي** فعل **Devil Trigger**! (شفاء + زيادة هجوم)`);
        }
    },
    "نيمسيس": {
        name: "قاذف الصواريخ",
        emoji: "🚀", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.0)); 
                log.push(`🚀 **نيمسيس** أطلق صاروخاً على **${target.name}**!`); 
            }
        }
    },
    "بيراميد هيد": {
        name: "حكم الإعدام",
        emoji: "🔪", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.0)); 
                target.effects.push({type:'burn', val: Math.floor(monster.atk*0.2), turns:3}); 
                log.push(`🔪 **بيراميد هيد** شق **${target.name}** بسكينه العظيم! (نزيف)`); 
            }
        }
    },
    "ويسكر المتحول": {
        name: "انتقال فوري",
        emoji: "🕶️", chance: 0.30,
        execute: (monster, players, log) => {
            const target = players.filter(p => !p.isDead).sort((a,b) => b.atk - a.atk)[0]; 
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); 
                target.skipCount = (target.skipCount||0)+1; 
                log.push(`🕶️ **ويسكر** باغث **${target.name}** بسرعة خارقة!`); 
            }
        }
    },
    "زيوس جبار الصواعق": {
        name: "غضب الأولمب",
        emoji: "⚡", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(t => { if(!t.isDead) applyDamageToPlayer(t, Math.floor(monster.atk * 1.2)); });
            log.push(`⚡ **زيوس** ألقى الصواعق على الجميع!`);
        }
    },
    "كريتوس شبح إسبارطة": {
        name: "غضب إسبارطة",
        emoji: "😡", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 3.0)); 
                log.push(`😡 **كريتوس** فقد أعصابه وانهال بالضرب على **${target.name}**!`); 
            }
        }
    },

    // ====================================================
    // 🛡️ Guardians (الحراس)
    // ====================================================
    "حارس البوابة الأخير": { 
        name: "الدرع العظيم", emoji: "🛡️", chance: 0.3, 
        execute: (m,p,l) => { m.hp += Math.floor(m.maxHp * 0.1); l.push(`🛡️ **الحارس** رفع درعه وترمم!`); } 
    },
    "درع العرش المنيع": { 
        name: "عكس الضرر", emoji: "🔄", chance: 0.3, 
        execute: (m,p,l) => { m.effects.push({type:'reflect', val:0.5, turns:2}); l.push(`🔄 **درع العرش** فعل وضعية الانعكاس!`); } 
    },
    "حامي الختم المقدس": { 
        name: "تطهير", emoji: "✨", chance: 0.3, 
        execute: (m,p,l) => { m.effects = []; m.hp += Math.floor(m.maxHp*0.05); l.push(`✨ **الحامي** طهر نفسه من اللعنات!`); } 
    },
    "ظل الملك القاتل": { 
        name: "اغتيال", emoji: "🗡️", chance: 0.3, 
        execute: (m,p,l) => { 
            const t=p.filter(x=>!x.isDead).sort((a,b)=>a.hp-b.hp)[0]; 
            if(t){applyDamageToPlayer(t, Math.floor(m.atk*2)); l.push(`🗡️ **الظل** اغتال أضعف حلقة: **${t.name}**!`);} 
        } 
    },
    "الجنرال الذي لا يقهر": { 
        name: "هجوم كاسح", emoji: "⚔️", chance: 0.3, 
        execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*1.2))}); l.push(`⚔️ **الجنرال** نفذ هجوماً كاسحاً!`); } 
    },
    "المدرع الأسطوري": { 
        name: "تحطيم الأرض", emoji: "🔨", chance: 0.3, 
        execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, m.atk)}); l.push(`🔨 **المدرع** حطم الأرض تحتكم!`); } 
    },
    "كابوس الأبعاد": { 
        name: "رعب", emoji: "👻", chance: 0.3, 
        execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'confusion',val:0.5,turns:2})}); l.push(`👻 **الكابوس** بث الرعب في القلوب!`); } 
    },
    "حارس الجحيم الأزلي": { 
        name: "نفس اللهب", emoji: "🔥", chance: 0.3, 
        execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'burn',val:Math.floor(m.atk*0.2),turns:3})}); l.push(`🔥 **الحارس** نفث نيران الجحيم!`); } 
    }
};

module.exports = { GENERIC_MONSTER_SKILLS, MONSTER_SKILLS };
