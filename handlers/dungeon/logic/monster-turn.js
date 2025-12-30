const { applyDamageToPlayer } = require('../utils');
const { getSmartTarget, MONSTER_SKILLS, GENERIC_MONSTER_SKILLS } = require('../monsters');
const { checkDeaths } = require('../core/battle-utils');
const { generateBattleEmbed } = require('../ui');

async function processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    let ongoing = true;

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
            // 3. هجوم الوحش ومهاراته
            const alive = players.filter(p => !p.isDead);
            let skillUsed = false;

            if (alive.length > 0) {
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

            if (!skillUsed && alive.length > 0) {
                if (Math.random() < 0.20) {
                    const randomGenericSkill = GENERIC_MONSTER_SKILLS[Math.floor(Math.random() * GENERIC_MONSTER_SKILLS.length)];
                    randomGenericSkill.execute(monster, players, log);
                    skillUsed = true;
                }
            }

            // 4. هجوم المستدعيات (Summons)
            if (!skillUsed && alive.length > 0) {
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

                // 5. الهجوم العادي
                let target = alive.find(p => p.id === monster.targetFocusId) || 
                             alive.find(p => p.effects.some(e => e.type === 'titan')) ||
                             getSmartTarget(players) || 
                             alive[Math.floor(Math.random() * alive.length)];
                
                if (target) {
                    let dmg = Math.floor(monster.atk * (1 + turnCount * 0.05));
                    if (monster.effects.some(e => e.type === 'weakness')) dmg = Math.floor(dmg * 0.75);
                    if(target.defending) dmg = Math.floor(dmg * 0.5);
                    
                    const reflectEffect = target.effects.find(e => e.type === 'reflect');
                    if (reflectEffect) {
                        const reflected = Math.floor(dmg * reflectEffect.val);
                        dmg -= reflected;
                        monster.hp -= reflected;
                        log.push(`🔄 **${target.name}** عكس **${reflected}** ضرر للوحش!`);
                    }

                    const takenDmg = applyDamageToPlayer(target, dmg);
                    if (takenDmg === 0 && dmg > 0) log.push(`👻 **${target.name}** راوغ الهجوم!`);
                    else log.push(`👹 **${monster.name}** ضرب **${target.name}** (${takenDmg})`);
                    
                    checkDeaths(players, floor, log, threadChannel);
                }
            }
        }
    }

    if (players.every(p => p.isDead)) return false; // Game over

    // تحديث الرسالة
    if (log.length > 5) log = log.slice(-5);
    await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
    
    return true; // Ongoing = true
}

module.exports = { processMonsterTurn };
