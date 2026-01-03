const { applyDamageToPlayer } = require('../utils');
const { getSmartTarget, MONSTER_SKILLS, GENERIC_MONSTER_SKILLS } = require('../monsters');
const { checkDeaths } = require('../core/battle-utils');
const { generateBattleEmbed } = require('../ui');

// دالة مساعدة لاختيار عدة أهداف فريدة
function getMultipleTargets(players, count, monster) {
    let alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return [];

    let targets = new Set();

    // 1. الأولوية القصوى لمن يملك تركيز الوحش (Taunt/Focus)
    const focusTarget = alive.find(p => p.id === monster.targetFocusId);
    if (focusTarget) targets.add(focusTarget);

    // 2. الأولوية لمن يستخدم جرعة العملاق (Titan)
    const titanTarget = alive.find(p => p.effects.some(e => e.type === 'titan'));
    if (titanTarget) targets.add(titanTarget);

    // 3. إكمال العدد المطلوب باستخدام الذكاء الاصطناعي (Smart Target)
    while (targets.size < count && targets.size < alive.length) {
        // نقوم بفلترة من تم اختيارهم مسبقاً لضمان عدم تكرار الضرب على نفس الشخص في نفس الدور (إلا إذا كان الوحش يملك مهارة خاصة)
        const remainingPlayers = alive.filter(p => !targets.has(p));
        if (remainingPlayers.length === 0) break;
        
        // استخدام getSmartTarget لاختيار الأفضل من البقية
        const smartPick = getSmartTarget(remainingPlayers); 
        if (smartPick) targets.add(smartPick);
        else targets.add(remainingPlayers[Math.floor(Math.random() * remainingPlayers.length)]);
    }

    return Array.from(targets);
}

async function processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    // 1. معالجة تأثيرات الوحش (حرق/سم)
    if (monster.frozen) { 
        log.push(`❄️ **${monster.name}** متجمد!`); 
        monster.frozen = false; 
    } else {
        if (monster.effects) {
            monster.effects = monster.effects.filter(e => {
                if (e.type === 'burn') {
                    const burnDmg = e.val;
                    monster.hp -= burnDmg;
                    log.push(`🔥 **${monster.name}** يحترق! (-${burnDmg} HP)`);
                }
                if (e.type === 'poison') {
                    const poisonDmg = e.val;
                    monster.hp -= poisonDmg;
                    log.push(`☠️ **${monster.name}** يتألم من السم! (-${poisonDmg} HP)`);
                }
                e.turns--;
                return e.turns > 0;
            });
        }

        // 2. التحقق من موت الوحش بسبب التأثيرات
        if (monster.hp <= 0) {
            monster.hp = 0;
            return false; // Ongoing = false
        }

        const confusion = monster.effects.find(e => e.type === 'confusion');
        if (confusion && Math.random() < confusion.val) {
            const selfDmg = Math.floor(monster.atk * 0.5);
            monster.hp -= selfDmg;
            log.push(`😵 **${monster.name}** في حالة ارتباك وضرب نفسه! (-${selfDmg} HP)`);
        } else {
            const alive = players.filter(p => !p.isDead);
            let skillUsed = false;

            // ============================================================
            // 🔥 منطق الزعيم موراكس (الطابق 100) - الذكاء الفائق 🔥
            // ============================================================
            if (floor === 100 && monster.name.includes("موراكس") && alive.length > 0) {
                // فرصة 40% لاستخدام "مهارات اللاعبين" بذكاء
                if (Math.random() < 0.4) {
                    // إذا صحته منخفضة (أقل من 30%)، يستخدم الشفاء
                    if (monster.hp < monster.maxHp * 0.30) {
                        const healAmount = Math.floor(monster.maxHp * 0.20);
                        monster.hp += healAmount;
                        log.push(`✨ **الامبراطور موراكس** استخدم [Heal] واستعاد **${healAmount}** صحة!`);
                        skillUsed = true;
                    } 
                    // إذا لم يكن بحاجة لشفاء، يستخدم مهارة هجومية أو درع
                    else {
                        const randomMove = Math.random();
                        if (randomMove < 0.33) {
                            // استخدام كرة نارية على الجميع
                            alive.forEach(p => {
                                const dmg = Math.floor(monster.atk * 1.2);
                                applyDamageToPlayer(p, dmg);
                                p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.1), turns: 2 });
                            });
                            log.push(`🔥 **موراكس** ألقى [Fireball] جماعية!`);
                            skillUsed = true;
                        } else if (randomMove < 0.66) {
                            // استخدام درع
                            monster.hp += Math.floor(monster.maxHp * 0.05); // درع بسيط كـ HP
                            log.push(`🛡️ **موراكس** استخدم [Shield] وعزز دفاعه!`);
                            skillUsed = true;
                        } else {
                            // ضربة قوية لواحد
                            const target = alive[Math.floor(Math.random() * alive.length)];
                            const dmg = Math.floor(monster.atk * 2.5);
                            applyDamageToPlayer(target, dmg);
                            log.push(`🗡️ **موراكس** استخدم [Assassinate] على **${target.name}** بضرر هائل!`);
                            skillUsed = true;
                        }
                    }
                }
            }
            // ============================================================

            // 3. مهارات الوحش الأصلية (إذا لم يستخدم مهارة لاعب أعلاه)
            if (!skillUsed && alive.length > 0) {
                const baseMonsterName = monster.name.split(' (Lv.')[0].trim();
                const monsterSkill = MONSTER_SKILLS[baseMonsterName];

                if (monsterSkill) {
                    let chance = monsterSkill.chance;
                    if (monster.hp < monster.maxHp * 0.3) chance += 0.2; 
                    if (Math.random() < chance) {
                        monsterSkill.execute(monster, players, log);
                        skillUsed = true;
                    }
                }
            }

            // مهارات عامة
            if (!skillUsed && alive.length > 0) {
                if (Math.random() < 0.20) {
                    const randomGenericSkill = GENERIC_MONSTER_SKILLS[Math.floor(Math.random() * GENERIC_MONSTER_SKILLS.length)];
                    randomGenericSkill.execute(monster, players, log);
                    skillUsed = true;
                }
            }

            // 4. هجوم المستدعيات (Summons)
            players.forEach(p => {
                if (!p.isDead && p.summon && p.summon.active && p.summon.turns > 0) {
                    const petDmg = Math.floor(p.atk * 0.5);
                    monster.hp -= petDmg;
                    p.totalDamage += petDmg;
                    log.push(`🐺 حارس **${p.name}** نهش الوحش! (${petDmg} ضرر)`);
                    p.summon.turns--;
                    if (p.summon.turns <= 0) {
                        p.summon.active = false;
                        log.push(`🐺 اختفى حارس **${p.name}**.`);
                    }
                }
            });

            if (monster.hp <= 0) return false;

            // 5. الهجوم العادي (مع نظام الأهداف المتعددة الجديد)
            if (!skillUsed && alive.length > 0) {
                
                // تحديد عدد الأهداف بناءً على الطابق
                let targetCount = 1;
                if (floor >= 40 && floor <= 50) targetCount = 2;
                else if (floor >= 51 && floor <= 80) targetCount = 3;
                else if (floor >= 81 && floor <= 99) targetCount = 4;
                else if (floor === 100) targetCount = 5; // هجوم شامل

                // اختيار الأهداف
                const targets = getMultipleTargets(players, targetCount, monster);

                if (targets.length > 0) {
                    // رسالة مجمعة للهجوم لتقليل الازعاج في السجل
                    let hitNames = [];
                    
                    targets.forEach(target => {
                        let dmg = Math.floor(monster.atk * (1 + turnCount * 0.05));
                        
                        // تعديلات الضرر
                        if (monster.effects.some(e => e.type === 'weakness')) dmg = Math.floor(dmg * 0.75);
                        if (target.defending) dmg = Math.floor(dmg * 0.5);
                        
                        // الانعكاس
                        const reflectEffect = target.effects.find(e => e.type === 'reflect');
                        if (reflectEffect) {
                            const reflected = Math.floor(dmg * reflectEffect.val);
                            dmg -= reflected;
                            monster.hp -= reflected;
                            // log.push(`🔄 **${target.name}** عكس **${reflected}** ضرر!`);
                        }

                        const takenDmg = applyDamageToPlayer(target, dmg);
                        
                        if (takenDmg === 0 && dmg > 0) {
                            hitNames.push(`${target.name} (راوغ)`);
                        } else {
                            hitNames.push(`${target.name} (-${takenDmg})`);
                        }
                    });

                    log.push(`👹 **${monster.name}** ضرب بعنف: [ ${hitNames.join(' | ')} ]`);
                    checkDeaths(players, floor, log, threadChannel);
                }
            }
        }
    }

    if (players.every(p => p.isDead)) return false; // Game over

    // تحديث الرسالة
    if (log.length > 6) log = log.slice(-6); // زدنا عدد الأسطر قليلاً
    await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
    
    return true; // Ongoing = true
}

module.exports = { processMonsterTurn };
