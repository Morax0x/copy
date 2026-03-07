const { EmbedBuilder } = require('discord.js');
const dungeonConfig = require('../../../json/dungeon-config.json'); 
const { applyDamageToPlayer } = require('../utils'); 
const { generateBattleEmbed } = require('../ui');

function getMoraxData() {
    const bossConfig = dungeonConfig.final_boss || {};
    
    return {
        isMonster: true,
        isFinalBoss: true, 
        name: bossConfig.name || "الامبراطور موراكس",
        image: bossConfig.image || "https://i.postimg.cc/WzRGhgJ9/mwraks.png",
        level: 100,
        hp: 1500000,      
        maxHp: 1500000,
        atk: 10000,       
        shield: 50000,    
        enraged: false,
        effects: [],
        targetFocusId: null, 
        frozen: false,
        memory: { 
            healsUsed: 0, 
            comboStep: 0, 
            turnCounter: 0 
        }
    };
}

async function processMoraxTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    monster.memory.turnCounter++;

    if (monster.frozen) {
        monster.frozen = false;
        log.push(`❄️ **${monster.name}** تحرر من الجليد بفضل طاقته الهائلة! (خسر هذا الدور)`);
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
        return true;
    }

    if (monster.effects) {
        monster.effects = monster.effects.filter(e => {
            let dmg = 0;
            const damageCap = 25000; 

            if (e.type === 'burn' || e.type === 'poison') {
                let val = e.val || 0;
                if (val < 1 && val > 0) dmg = Math.floor(monster.maxHp * val); 
                else dmg = Math.floor(val); 
                
                if (dmg > damageCap) dmg = damageCap;
                
                monster.hp = Math.max(0, monster.hp - dmg);
                const icon = e.type === 'burn' ? '🔥' : '☠️';
                log.push(`${icon} **${monster.name}** يتضرر: -${dmg}`);
            }

            e.turns--;
            return e.turns > 0;
        });
    }

    if (monster.hp <= 0) { monster.hp = 0; return false; } 

    if (monster.memory.turnCounter % 3 === 0) {
        monster.shield += 15000;
        log.push(`🛡️ **${monster.name}** يجمع الصخور حوله ويجدد درعه! (+15,000)`);
    }

    const alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return false;

    let targets = [];
    if (monster.targetFocusId) {
        const taunted = alive.find(p => p.id === monster.targetFocusId);
        if (taunted) targets = [taunted];
        monster.targetFocusId = null; 
    }

    let skillUsed = false;
    const rand = Math.random();

    if (!skillUsed && targets.length === 0 && rand < 0.25) {
        alive.forEach(p => {
            let dmg = Math.floor(monster.atk * 1.8);
            if (p.defending) dmg = Math.floor(dmg * 0.6); 
            
            applyDamageToPlayer(p, dmg);
            p.effects.push({ type: 'weakness', val: 0.5, turns: 99 });
        });
        log.push(`☄️ **${monster.name}**: "سأريكم النظام!" (Planet Befall) - نيزك ساحق!`);
        skillUsed = true;
    }

    else if (!skillUsed && targets.length === 0 && rand < 0.45) {
        const weakTarget = alive.sort((a, b) => a.hp - b.hp)[0];
        if (weakTarget) {
            let dmg = Math.floor(monster.atk * 4.5); 
            
            const reflect = weakTarget.effects.find(e => e.type === 'reflect' || e.type === 'tank_reflect');
            if (reflect) {
                const reflected = Math.floor(dmg * (reflect.val || 0.4));
                monster.hp -= reflected;
                dmg -= reflected;
                log.push(`↩️ **${weakTarget.name}** عكس جزءاً من الإعدام! (-${reflected} للزعيم)`);
            }

            const taken = applyDamageToPlayer(weakTarget, dmg);
            log.push(`🗡️ **${monster.name}** وجه رمحه الذهبي نحو قلب **${weakTarget.name}**! (-${taken})`);
            skillUsed = true;
        }
    }

    else if (!skillUsed && targets.length === 0 && rand < 0.65) {
        alive.forEach(p => {
            const dmg = Math.floor(monster.atk * 1.2);
            applyDamageToPlayer(p, dmg);
            p.effects = p.effects.filter(e => !['atk_buff', 'def_buff', 'shield'].includes(e.type));
        });
        log.push(`🌋 **${monster.name}** ضرب الأرض بقوة! (زلزال) - تم تحطيم جميع الدفاعات!`);
        skillUsed = true;
    }

    if (!skillUsed) {
        const attackTargets = targets.length > 0 ? targets : alive.sort(() => 0.5 - Math.random()).slice(0, 2);
        let hitLog = [];
        
        attackTargets.forEach(t => {
            let dmg = Math.floor(monster.atk * 1.0);
            
            const weaken = monster.effects.find(e => e.type === 'lightning_weaken');
            if (weaken) dmg = Math.floor(dmg * 0.1); 

            const taken = applyDamageToPlayer(t, dmg);
            hitLog.push(`${t.name}: -${taken}`);
        });
        log.push(`⚔️ **${monster.name}** يهاجم: [ ${hitLog.join(' | ')} ]`);
    }

    const deadJustNow = players.filter(p => p.hp <= 0 && !p.isDead);
    for (const p of deadJustNow) {
        p.isDead = true;

        if (p.reviveCount && p.reviveCount >= 1) {
            p.isPermDead = true;
            await threadChannel.send(`☠️ **${p.name}** سحقه الإمبراطور تماماً... تحللت جثته ولا أمل لعودته!`).catch(()=>{});
        } else {
            await threadChannel.send(`💀 **${p.name}** لم يستطع تحمل هيبة الإمبراطور وسقط!`).catch(()=>{});
        }
        
        if (p.class === 'Priest') {
             players.forEach(ally => {
                if (!ally.isDead && ally.id !== p.id) {
                    const healAmt = Math.floor(ally.maxHp * 0.30);
                    ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                }
            });
            await threadChannel.send(`✨ **تضحية الكاهن الأخيرة!** تم شفاء الناجين بنسبة 30%.`).catch(()=>{});
        }
    }

    if (log.length > 6) log.splice(0, log.length - 6);

    try {
        await battleMsg.edit({ 
            embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] 
        }); 
    } catch (e) { 
        console.log("Error updating Morax embed:", e.message); 
    }

    return true;
}

module.exports = { getMoraxData, processMoraxTurn };
