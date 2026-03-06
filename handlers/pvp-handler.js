const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, Colors } = require("discord.js");
const core = require('./pvp-core.js'); 
const { calculateMoraBuff } = require('../streak-handler.js'); 

async function processMonsterTurn(battleState, db) {
    const monsterId = "monster";
    const playerId = battleState.turn[1]; 
    const monster = battleState.players.get(monsterId);
    const player = battleState.players.get(playerId);

    await new Promise(r => setTimeout(r, 1500)); 

    const { logEntries, skipTurn } = core.applyPersistentEffects(battleState, monsterId);
    battleState.log.push(...logEntries);

    if (monster.hp <= 0) {
        await core.endBattle(battleState, playerId, db, "win");
        return;
    }

    if (skipTurn) {
        battleState.log.push(`⚡ **${monster.name}** لم يستطع التحرك بسبب الشلل!`);
    } else {
        let hitSelf = false;
        if (monster.effects.confusion && Math.random() < 0.5) {
            hitSelf = true;
            const selfDmg = Math.floor(monster.weapon.currentDamage * 0.5);
            monster.hp -= selfDmg;
            battleState.log.push(`😵 **${monster.name}** ضرب نفسه بسبب الارتباك! (-${selfDmg})`);
        }

        if (!hitSelf) {
            let isBlindMiss = false;
            if (monster.effects.blind > 0 && Math.random() < 0.5) {
                isBlindMiss = true;
                battleState.log.push(`🌫️ **${monster.name}** أخطأ الهجوم بسبب العمى!`);
            }

            if (!isBlindMiss) {
                if (player.effects.evasion > 0) {
                    battleState.log.push(`👻 **${monster.name}** هاجم، لكنك راوغت الهجوم ببراعة!`);
                } else {
                    let damage = monster.weapon.currentDamage;
                    
                    if (monster.effects.weaken > 0) damage = Math.floor(damage * (1 - monster.effects.weaken));

                    let damageTaken = Math.floor(damage);

                    if (player.effects.shield > 0) {
                        if (player.effects.shield >= damageTaken) {
                            player.effects.shield -= damageTaken;
                            damageTaken = 0;
                            battleState.log.push(`🛡️ درع اللاعب امتص الهجوم بالكامل!`);
                        } else {
                            damageTaken -= player.effects.shield;
                            player.effects.shield = 0;
                            battleState.log.push(`🛡️ درع اللاعب تحطم ولكنه خفف الضرر!`);
                        }
                    }

                    if (player.effects.rebound_active > 0) {
                        const reflected = Math.floor(damageTaken * player.effects.rebound_active);
                        monster.hp -= reflected;
                        damageTaken -= reflected;
                        battleState.log.push(`🔄 عكست **${reflected}** ضرر للوحش!`);
                    }

                    player.hp -= damageTaken;
                    if (damageTaken > 0) battleState.log.push(`🦑 **${monster.name}** هاجمك وألحق **${damageTaken}** ضرر!`);
                }
            }
        }
    }

    if (player.hp <= 0) {
        player.hp = 0;
        await core.endBattle(battleState, monsterId, db, "win");
        return;
    }

    battleState.turn = [playerId, monsterId];
    
    const { embeds, components } = core.buildBattleEmbed(battleState, false);
    if (battleState.message) {
        await battleState.message.edit({ embeds, components }).catch(() => {});
    }
    battleState.processingTurn = false;
}

async function handlePvpChallenge(i, client, db) {
    const parts = i.customId.split('_');
    const action = parts[1]; 
    const challengerId = parts[2];
    const opponentId = parts[3];
    const bet = parseInt(parts[4]);

    if (i.user.id !== opponentId && (action === 'accept' || action === 'decline')) {
        return i.reply({ content: "أنت لست الشخص المطلوب في هذا التحدي.", flags: [MessageFlags.Ephemeral] });
    }

    if ((i.user.id === challengerId || i.user.id === opponentId) && action === 'decline') {
        if (!core.activePvpChallenges.has(i.channel.id)) return i.update({ content: "انتهى وقت التحدي.", embeds: [], components: [] });
        core.activePvpChallenges.delete(i.channel.id);

        await db.query("UPDATE levels SET lastpvp = 0 WHERE userid = $1 AND guildid = $2", [challengerId, i.guild.id]);

        const isCancel = i.user.id === challengerId;
        const declineEmbed = new EmbedBuilder()
            .setTitle(isCancel ? '⚔️ تم إلغاء التحدي' : '🛡️ تم رفض التحدي')
            .setDescription(isCancel ? `قام ${core.cleanDisplayName(i.member.user.displayName)} بإلغاء التحدي.` : `لقد قام ${core.cleanDisplayName(i.member.user.displayName)} برفض التحدي.`)
            .setColor(isCancel ? Colors.Grey : Colors.Red);
        return i.update({ embeds: [declineEmbed], components: [] });
    }

    if (action === 'accept') {
        if (!core.activePvpChallenges.has(i.channel.id)) return i.update({ content: "انتهى وقت التحدي.", embeds: [], components: [] });

        const opponentMember = i.member;
        const challengerMember = await i.guild.members.fetch(challengerId).catch(() => null);
        
        if (!challengerMember) {
            await db.query("UPDATE levels SET lastpvp = 0 WHERE userid = $1 AND guildid = $2", [challengerId, i.guild.id]);
            return i.update({ content: "المتحدي غادر السيرفر.", embeds: [], components: [] });
        }

        const opponentWeapon = await core.getWeaponData(db, opponentMember);
        if (!opponentWeapon || opponentWeapon.currentLevel === 0) return i.reply({ content: `❌ أنت لست جاهزاً (تحتاج سلاح وعرق).`, flags: [MessageFlags.Ephemeral] });

        const challengerWeapon = await core.getWeaponData(db, challengerMember);
        if (!challengerWeapon || challengerWeapon.currentLevel === 0) {
            await db.query("UPDATE levels SET lastpvp = 0 WHERE userid = $1 AND guildid = $2", [challengerId, i.guild.id]);
            return i.update({ content: `❌ المتحدي لم يعد جاهزاً.`, embeds: [], components: [] });
        }

        core.activePvpChallenges.delete(i.channel.id);
        await i.deferUpdate(); 
        await i.editReply({ components: [] });
        const acceptEmbed = new EmbedBuilder().setTitle('🔥 تم قبول التحدي!').setColor(Colors.Green);
        await i.followUp({ embeds: [acceptEmbed] });
        await core.startPvpBattle(i, client, db, challengerMember, opponentMember, bet);
    }
}

async function handlePvpTurn(i, client, db) {
    let battleState = core.activePvpBattles.get(i.channel.id);
    let isPvE = false;
    if (!battleState) { battleState = core.activePveBattles.get(i.channel.id); isPvE = true; }
    if (!battleState) { if (i.customId.startsWith('pvp_')) return i.update({ content: "انتهت المعركة.", components: [] }).catch(() => {}); return; }

    const attackerId = battleState.turn[0];
    const defenderId = battleState.turn[1];

    if (i.user.id !== attackerId) return i.reply({ content: "ليس دورك!", flags: [MessageFlags.Ephemeral] });

    try {
        if (['pvp_action_skill', 'pvp_skill_back'].includes(i.customId) || i.customId.startsWith('pvp_skill_page_')) {
            let page = battleState.skillPage;
            if (i.customId.startsWith('pvp_skill_page_')) page = parseInt(i.customId.split('_')[3]);
            if (i.customId === 'pvp_action_skill') page = 0;
            
            const { embeds, components } = core.buildBattleEmbed(battleState, i.customId !== 'pvp_skill_back', page);
            return await i.update({ embeds, components });
        }
        
        if (i.customId.startsWith('pvp_skill_use_')) {
            const skillId = i.customId.replace('pvp_skill_use_', '');
            if (battleState.skillCooldowns[attackerId][skillId] > 0) return i.reply({ content: "المهارة في الانتظار (Cooldown)!", flags: [MessageFlags.Ephemeral] });
        }
    } catch (e) { if (e.code === 10062) return; throw e; }

    if (battleState.processingTurn) return i.reply({ content: "⌛ جاري المعالجة...", flags: [MessageFlags.Ephemeral] });
    battleState.processingTurn = true;

    try {
        await i.deferUpdate();
        const attacker = battleState.players.get(attackerId);
        const defender = battleState.players.get(defenderId);
        const attackerName = attacker.isMonster ? attacker.name : core.cleanDisplayName(attacker.member.user.displayName);
        const defenderName = defender.isMonster ? defender.name : core.cleanDisplayName(defender.member.user.displayName);

        const { logEntries, skipTurn } = core.applyPersistentEffects(battleState, attackerId);
        battleState.log.push(...logEntries);

        if (attacker.hp <= 0) {
            attacker.hp = 0;
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return; 
        }

        if (skipTurn) {
            battleState.log.push(`⚡ **${attackerName}** مشلول ولا يستطيع الحركة!`);
            
            battleState.turn = [defenderId, attackerId];
            const { embeds, components } = core.buildBattleEmbed(battleState, false);
            await i.editReply({ embeds, components });

            if (isPvE && battleState.turn[0] === "monster") {
                processMonsterTurn(battleState, db); 
            } else {
                battleState.processingTurn = false;
            }
            return;
        }

        let isConfusedHit = false;
        if (attacker.effects.confusion && Math.random() < 0.5) {
            isConfusedHit = true;
        }

        if (i.customId === 'pvp_action_forfeit') {
            await core.endBattle(battleState, defenderId, db, "forfeit", calculateMoraBuff);
            return; 
        }

        Object.keys(battleState.skillCooldowns[attackerId]).forEach(skill => { if (battleState.skillCooldowns[attackerId][skill] > 0) battleState.skillCooldowns[attackerId][skill]--; });

        let actionLog = "";

        if (isConfusedHit && (i.customId === 'pvp_action_attack' || i.customId.startsWith('pvp_skill_use_'))) {
            const selfDmg = Math.floor(attacker.weapon.currentDamage * 0.5);
            attacker.hp -= selfDmg;
            battleState.log.push(`😵 **${attackerName}** في حالة ارتباك وضرب نفسه! (-${selfDmg})`);
        } 
        else if (i.customId.startsWith('pvp_skill_use_')) {
            const skillId = i.customId.replace('pvp_skill_use_', '');
            const skill = Object.values(attacker.skills).find(s => s.id === skillId);
            
            battleState.skillCooldowns[attackerId][skillId] = skill.cooldown || core.SKILL_COOLDOWN_TURNS;

            actionLog = core.applySkillEffect(battleState, attackerId, skill);
            battleState.log.push(actionLog);
        }
        else if (i.customId === 'pvp_action_attack') {
            if (!attacker.weapon || attacker.weapon.currentLevel === 0) {
                 battleState.log.push(`❌ ${attackerName} يحاول الهجوم بلا سلاح!`);
            } else {
                if (attacker.effects.blind > 0 && Math.random() < 0.5) {
                    battleState.log.push(`🌫️ **${attackerName}** أخطأ الهجوم بسبب العمى!`);
                } else {
                    const dmg = core.calculateDamage(attacker, defender);
                    
                    if (defender.effects.evasion > 0) {
                        battleState.log.push(`👻 **${attackerName}** هاجم، لكن **${defenderName}** راوغ ببراعة!`);
                    } else {
                        if (defender.effects.rebound_active > 0) {
                            const rawDmg = core.calculateDamage(attacker, defender, 1, true); 
                            const reflected = Math.floor(rawDmg * defender.effects.rebound_active);
                            battleState.log.push(`🔄 **${defenderName}** عكس **${reflected}** من الضرر!`);
                        }
                        
                        defender.hp -= dmg;
                        if (dmg > 0) battleState.log.push(`⚔️ **${attackerName}** هاجم وألحق **${dmg}** ضرر!`);
                        else battleState.log.push(`🛡️ **${defenderName}** امتص الضربة بالكامل!`);
                    }
                }
            }
        }

        if (defender.hp <= 0) {
            defender.hp = 0;
            const { embeds, components } = core.buildBattleEmbed(battleState);
            await i.editReply({ embeds, components });
            await core.endBattle(battleState, attackerId, db, "win", calculateMoraBuff);
            return;
        }
        if (attacker.hp <= 0) {
            attacker.hp = 0;
            const { embeds, components } = core.buildBattleEmbed(battleState);
            await i.editReply({ embeds, components });
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return;
        }

        battleState.turn = [defenderId, attackerId];
        const { embeds, components } = core.buildBattleEmbed(battleState, false);
        await i.editReply({ embeds, components });

        if (isPvE && battleState.turn[0] === "monster") {
            processMonsterTurn(battleState, db); 
        } else {
            battleState.processingTurn = false;
        }

    } catch (err) {
        console.error("[PvP Handler Error]", err);
        if (!i.replied) await i.followUp({ content: "حدث خطأ.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
    } finally {
        if (battleState && (!isPvE || battleState.turn[0] !== "monster")) {
            battleState.processingTurn = false;
        }
    }
}

async function handlePvpInteraction(i, client, db) {
    try {
        if (i.customId.startsWith('pvp_accept_') || i.customId.startsWith('pvp_decline_')) {
            await handlePvpChallenge(i, client, db);
        } else {
            await handlePvpTurn(i, client, db);
        }
    } catch (error) {
        if (error.code === 10062) return; 
        console.error("[PvP Handler] Critical Error:", error);
    }
}

module.exports = {
    handlePvpInteraction,
    activePvpChallenges: core.activePvpChallenges,
    activePvpBattles: core.activePvpBattles,
};
