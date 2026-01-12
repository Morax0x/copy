const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Colors, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

const { 
    dungeonConfig, 
    EMOJI_MORA, 
    EMOJI_XP, 
    EMOJI_BUFF, 
    EMOJI_NERF, 
    OWNER_ID, 
    WIN_IMAGES, 
    LOSE_IMAGES, 
    skillsConfig, 
    ownerSkills, 
    potionItems 
} = require('./dungeon/constants');

const { 
    ensureInventoryTable, 
    getRandomImage, 
    getBaseFloorMora, 
    applyDamageToPlayer, 
    getRealPlayerData 
} = require('./dungeon/utils');

const { 
    getRandomMonster, 
    getSmartTarget, 
    checkBossPhase, 
    GENERIC_MONSTER_SKILLS, 
    MONSTER_SKILLS 
} = require('./dungeon/monsters');

const { handleSkillUsage } = require('./dungeon/skills');

const { 
    buildSkillSelector, 
    buildPotionSelector, 
    generateBattleEmbed, 
    generateBattleRows 
} = require('./dungeon/ui');

// ✅ استدعاء محرك الأسلحة الموحد
const weaponCalculator = require('./combat/weapon-calculator');

const { triggerMimicChest } = require('./dungeon/mimic-chest');
const { triggerMysteryMerchant } = require('./dungeon/mystery-merchant');

const { cleanName, checkDeaths, handleLeaderSuccession } = require('./dungeon/core/battle-utils'); 
const { setupPlayers } = require('./dungeon/core/setup');
const { sendEndMessage } = require('./dungeon/core/end-game');
const { handleOwnerMenu } = require('./dungeon/actions/owner-menu');
const { processMonsterTurn } = require('./dungeon/logic/monster-turn');

const { 
    handleMemberRetreat, 
    handleTeamWipe, 
    handleLeaderRetreat, 
    snapshotLootAtFloor20 
} = require('./dungeon/core/rewards');

function saveDungeonState(sql, channelID, guildID, hostID, state) {
    const data = JSON.stringify(state);
    sql.prepare(`
        INSERT OR REPLACE INTO active_dungeons (channelID, guildID, hostID, data)
        VALUES (?, ?, ?, ?)
    `).run(channelID, guildID, hostID, data);
}

function deleteDungeonState(sql, channelID) {
    sql.prepare("DELETE FROM active_dungeons WHERE channelID = ?").run(channelID);
}

async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId, partyClasses, activeDungeonRequests, resumeData = null) {
    const guild = threadChannel.guild;
      
    if (!sql || !sql.open) {
        return threadChannel.send("⚠️ **خطأ تقني:** قاعدة البيانات غير متصلة حالياً.").catch(() => {});
    }
    ensureInventoryTable(sql); 

    let retreatedPlayers = []; 
    let isTrapActive = false;
    let trapStartFloor = 0;
    let lastEventFloor = -10; 
    let lastEventType = null; 
    let merchantState = {
        skipFloors: 0,
        weaknessActive: false,
        isGateJump: false 
    };
    
    let retreatState = {
        range_30_40: false,
        range_41_50: false,
        range_51_70: false,
        range_71_90: false
    };

    let players = [];
    let startFloor = 1;
    let totalAccumulatedCoins = 0;
    let totalAccumulatedXP = 0;
    
    let resumedMonsterData = null;

    if (resumeData) {
        players = resumeData.players;
        merchantState = resumeData.merchantState || merchantState;
        retreatState = resumeData.retreatState || retreatState; 
        totalAccumulatedCoins = resumeData.loot.coins;
        totalAccumulatedXP = resumeData.loot.xp;
        startFloor = resumeData.floor;
        retreatedPlayers = resumeData.retreatedPlayers || [];
        isTrapActive = resumeData.isTrapActive || false;
        resumedMonsterData = resumeData.monsterData || null;
        
        await threadChannel.send(`🔄 **تم استعادة البيانات!** جاري استكمال المعركة من الطابق **${startFloor}**...`).catch(()=>{});
    } else {
        players = await setupPlayers(guild, partyIDs, partyClasses, sql, OWNER_ID);
    }

    if (players.length === 0) {
        if (!resumeData) activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ: لم يتم العثور على اللاعبين.").catch(() => {});
    }

    if (!resumeData) {
        players.forEach(p => {
            if (p.isSealed) {
                 threadChannel.send(`✶ <@${p.id}> تـم ختـم قوتك الى الطابـق 18 لن تتمكن من استعمال قوتك جيدا, الطوابق الدنيا لا تتحـمل جبروتك`).catch(() => {});
            }
        });
    }

    const maxFloors = 100; 

    // ============================================================
    // 🔥 مراقب الرسائل لكشف الحالة
    // ============================================================
    const statusKeywords = ['كشف', 'هيل', 'هيلي', 'دم', 'دمي', 'HP', 'كم دمي'];
    const statusFilter = m => statusKeywords.includes(m.content.trim()) && !m.author.bot;
    const statusCollector = threadChannel.createMessageCollector({ filter: statusFilter, time: 24 * 60 * 60 * 1000 });

    statusCollector.on('collect', async m => {
        const player = players.find(p => p.id === m.author.id);
        if (!player) return; 

        if (player.isDead) {
             return m.reply({ content: `👻 **${player.name}** أنت ميت حالياً!` }).catch(()=>{});
        }

        const percent = Math.max(0, Math.min(1, player.hp / player.maxHp));
        const filled = Math.round(percent * 10);
        const empty = 10 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        const classMap = { 'Warrior': 'محارب', 'Tank': 'مدافع', 'Priest': 'كاهن', 'Mage': 'ساحر', 'Assassin': 'سفاح', 'Leader': 'قائد' };
        const arClass = classMap[player.class] || player.class;
        let msgContent = `👤 **${player.name}** [${arClass}]\n[${bar}] ❤️ **${player.hp}/${player.maxHp}**`;
        if (player.shield > 0) msgContent += `\n🛡️ **الدرع:** ${player.shield}`;
        await m.reply({ content: msgContent }).catch(()=>{});
    });

    // ============================================================
    // بداية حلقة الطوابق (Main Loop)
    // ============================================================
    for (let floor = startFloor; floor <= maxFloors; floor++) {
        
        if (players.length === 0 || players.every(p => p.isDead)) {
            deleteDungeonState(sql, threadChannel.id); 
            statusCollector.stop(); 
            await handleTeamWipe(players, floor, sql, guild.id);
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break; 
        }

        if (merchantState.skipFloors > 0) {
            let floorsSkipped = 0;
            let targetFloor = 0;

            if (merchantState.isGateJump) {
                targetFloor = merchantState.skipFloors;
                floorsSkipped = targetFloor - floor; 
                merchantState.isGateJump = false;
            } else {
                floorsSkipped = merchantState.skipFloors;
                targetFloor = floor + floorsSkipped;
            }

            merchantState.skipFloors = 0; 
            const oldFloor = floor;
            floor = targetFloor; 
              
            if (floor > maxFloors) floor = maxFloors; 

            try {
                await threadChannel.send(`⏩ **انتقال سريع!** تم القفز من الطابق ${oldFloor} إلى ${floor}.`);
            } catch (err) {
                console.log("Error sending message:", err.message);
                break; 
            }
            
            saveDungeonState(sql, threadChannel.id, guild.id, hostId, {
                floor: floor,
                players: players,
                merchantState: merchantState,
                retreatState: retreatState, 
                retreatedPlayers: retreatedPlayers,
                isTrapActive: isTrapActive,
                loot: { coins: totalAccumulatedCoins, xp: totalAccumulatedXP },
                themeName: theme.name,
                monsterData: null 
            });
            
            continue; 
        }

        // ============================================================
        // ✅ منطق الختم
        // ============================================================
        if (floor === 15) {
            players.forEach(p => {
                if (p.isSealed) {
                    p.sealMultiplier = 0.5;
                    if (!p.isDead) {
                        threadChannel.send(`✶ <@${p.id}> كسرت الختم بشكل جزئي عن قوتـك .. استـمر !`).catch(() => {});
                    }
                }
            });
        }
        if (floor === 19) {
            players.forEach(p => {
                if (p.isSealed) {
                    p.isSealed = false;
                    p.sealMultiplier = 1.0;
                    if (!p.isDead) {
                        threadChannel.send(`✶ <@${p.id}> تـم كـسـر الخـتم عنك واطلق العنان لقوتك، لك الآن الحُرّيـة الكامـلة في استعمالها`).catch(() => {});
                    }
                }
            });
        }

        for (let p of players) {
            if (!p.isDead) { 
                if (p.shieldPersistent) {
                    p.shieldFloorsCount = (p.shieldFloorsCount || 0) + 1;

                    if (p.shieldFloorsCount > 5) {
                        p.shieldPersistent = false; 
                        p.shield = p.startingShield || 0; 
                        p.shieldFloorsCount = 0;
                        threadChannel.send(`🛡️ **درع المرتزقة** الخاص بـ <@${p.id}> اهترأ وتلاشى بعد صموده 5 طوابق!`).catch(()=>{});
                    } else {
                        p.shield = (p.shield || 0) + (p.startingShield || 0);
                    }
                } else {
                    p.shield = p.startingShield || 0;
                    p.shieldFloorsCount = 0; 
                }
                
                p.startingShield = 0; 
                
                p.effects = p.effects.filter(e => 
                    ['poison', 'atk_buff', 'def_buff', 'weakness', 'titan', 'burn', 'stun', 'rebound_active', 'confusion', 'crit_buff', 'luck_buff'].includes(e.type)
                );
                
                p.defending = false; 
                p.summon = null; 
            } 
        }

        let monsterType = 'minion'; 

        if (floor === 100) {
            monsterType = 'morax';
        } else if (floor >= 31) {
            monsterType = 'boss';
        } else if (floor >= 21) {
            monsterType = 'guardian';
        } else if (floor >= 11) {
            monsterType = 'elite';
        } else {
            monsterType = 'minion';
        }
        
        let monster;

        if (resumedMonsterData) {
            monster = resumedMonsterData;
            resumedMonsterData = null; 
        } else {
            const randomMob = getRandomMonster(monsterType, theme, floor);
            let finalHp, finalAtk;
            
            if (floor <= 10) {
                finalHp = 300 + ((floor - 1) * 120);
                finalAtk = 10 + (floor * 1.5); 
            } 
            else if (floor <= 20) {
                finalHp = 1500 + ((floor - 10) * 300);
                finalAtk = 28 + ((floor - 10) * 3); 
            } 
            else if (floor <= 30) {
                finalHp = 5000 + ((floor - 20) * 600);
                finalAtk = 60 + ((floor - 20) * 4);
            } 
            else if (floor <= 50) {
                const tier = floor - 30;
                finalHp = 12000 + (tier * 1500); 
                finalAtk = 110 + (tier * 7); 
            }
            else {
                const tier = floor - 50;
                finalHp = 50000 + (Math.pow(tier, 1.8) * 600);
                finalAtk = 300 + (tier * 15);
            }

            if (floor === 100) {
                finalHp = 1500000; 
                finalAtk = 10000;  
            }

            monster = {
                isMonster: true, 
                name: floor === 100 ? randomMob.name : `${randomMob.name} (Lv.${floor})`, 
                hp: Math.floor(finalHp), 
                maxHp: Math.floor(finalHp), 
                atk: Math.floor(finalAtk), 
                shield: 0, 
                enraged: false, 
                effects: [], 
                targetFocusId: null, 
                frozen: false,
                memory: { healsUsed: 0, comboStep: 0, lastMove: null } 
            };

            if (floor <= 15) {
                monster.atk = Math.min(monster.atk, 45); 
            } else if (floor <= 25) {
                monster.atk = Math.min(monster.atk, 90); 
            }

            if (merchantState.weaknessActive) {
                monster.effects.push({ type: 'weakness', val: 0.50, turns: 99 });
                merchantState.weaknessActive = false;
            }
        }

        saveDungeonState(sql, threadChannel.id, guild.id, hostId, {
            floor: floor, players, merchantState, retreatedPlayers, isTrapActive,
            retreatState, 
            loot: { coins: totalAccumulatedCoins, xp: totalAccumulatedXP },
            themeName: theme.name,
            monsterData: monster 
        });

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.hp.toLocaleString()} | DMG: ${monster.atk})`];
        if (monster.effects.some(e => e.type === 'weakness')) log.push(`👁️ **تم كشف نقطة ضعف الوحش!** (+50% ضرر إضافي)`);

        let ongoing = true;
        let turnCount = 0;

        let battleMsg;
        try {
            battleMsg = await threadChannel.send({ 
                content: '', 
                embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                components: generateBattleRows() 
            });
        } catch (err) {
            console.log("Dungeon Stop: Thread likely deleted.");
            break;
        }

        // ============================================================
        // حلقة المعركة (Battle Loop)
        // ============================================================
        while (ongoing) {
            const collector = battleMsg.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });
            let actedPlayers = [];
            let processingUsers = new Set(); 
            let ongoingRef = { value: true }; 

            await new Promise(resolve => {
                const turnTimeout = setTimeout(async () => { 
                    const afkPlayers = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                      
                    if (afkPlayers.length > 0) {
                        for (const afkP of afkPlayers) {
                            afkP.skipCount = (afkP.skipCount || 0) + 1;
                            
                            if (afkP.skipCount >= 5) {
                                afkP.hp = 0; afkP.isDead = true; afkP.isPermDead = true; afkP.deathFloor = floor;
                                const debuffDuration = 60 * 60 * 1000; const expiresAt = Date.now() + debuffDuration;
                                if (sql.open) {
                                    sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guild.id, afkP.id, -100, expiresAt, 'mora', -1.0);
                                    sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guild.id, afkP.id, -100, expiresAt, 'xp', -1.0);
                                }
                                log.push(`☠️ **${afkP.name}** ابتـلعـه الدانـجون بسبب الخمـول!`);
                                await threadChannel.send(`✶ <@${afkP.id}> <:emoji_69:1451172248173023263> خـرقـت قوانين الدانجـون بسبب خمولك المستمـر...`).catch(()=>{});
                            } else {
                                monster.targetFocusId = afkP.id; actedPlayers.push(afkP.id); 
                                await threadChannel.send(`<:downward:1435880484046372914> <@${afkP.id}> تم تخطي دورك بسبب عدم الاستجابة! (تحذير ${afkP.skipCount}/5)`).catch(()=>{});
                            }
                        }
                        
                        handleLeaderSuccession(players, log);

                        if (players.every(p => p.isDead)) { ongoing = false; collector.stop('all_dead'); return; }
                        log.push(`⚠️ تم تخطي دور اللاعبين الخاملين.`);
                        collector.stop('turn_end'); 
                    } else {
                        collector.stop('turn_end');
                    }
                }, 45000); 

                collector.on('collect', async i => {
                    if (i.customId === 'def' && i.user.id === OWNER_ID) {
                        await handleOwnerMenu(i, players, monster, log, threadChannel, sql, guild, hostId, activeDungeonRequests, merchantState, battleMsg, turnTimeout, collector, ongoingRef);
                        if (!ongoingRef.value) {
                             ongoing = false;
                             if (!collector.ended) collector.stop('owner_action'); 
                        }
                        return;
                    }

                    if (i.user.id === OWNER_ID && !players.find(p => p.id === OWNER_ID)) {
                        const member = await i.guild.members.fetch(OWNER_ID).catch(() => null);
                        if (member) {
                             const ownerPlayer = getRealPlayerData(member, sql, '???'); 
                             ownerPlayer.name = cleanName(ownerPlayer.name);
                             players.push(ownerPlayer);
                             log.push(`👑 **الأمبراطـور اقتحـم المعركـة!**`);
                        }
                    }
                        
                    if (!i.replied && !i.deferred && !i.isStringSelectMenu() && !i.isModalSubmit()) await i.deferUpdate().catch(()=>{});
                        
                    if (processingUsers.has(i.user.id)) return i.followUp({ content: "🚫 اهدأ! طلبك قيد المعالجة.", ephemeral: true }).catch(()=>{});
                        
                    let p = players.find(pl => pl.id === i.user.id);
                    if (!p) return i.followUp({ content: "🚫 لست مشاركاً!", ephemeral: true });
                    if (p.isDead || actedPlayers.includes(p.id)) return;

                    if (p.effects.some(e => e.type === 'stun')) {
                        await i.followUp({ content: "🚫 **أنت مشلول ولا تستطيع الحركة هذا الدور!**", ephemeral: true });
                        actedPlayers.push(p.id); p.skipCount = 0; 
                        log.push(`❄️ **${p.name}** مشلول ولم يستطع التحرك!`);
                        
                        await battleMsg.edit({ 
                            content: '', 
                            embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
                        }).catch(()=>{});
                        
                        // ✅ إنهاء الدور إذا الكل لعب (بما فيهم المشلول)
                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimeout); collector.stop('turn_end'); }
                        return;
                    }
                        
                    processingUsers.add(i.user.id);

                    try {
                        if (i.customId === 'skill') {
                            const skillRow = buildSkillSelector(p);
                            if (!skillRow) {
                                await i.followUp({ content: "❌ لا توجد مهارات.", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const skillMsg = await i.followUp({ content: "✨ **اختر المهارة:**", components: [skillRow], ephemeral: true });
                                const selection = await skillMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 10000 });
                                await selection.deferUpdate().catch(()=>{}); 

                                const skillId = selection.values[0];
                                
                                const shieldSkills = ['skill_shielding', 'race_human_skill'];
                                if (shieldSkills.includes(skillId) && p.shield > 0) {
                                    await selection.followUp({ content: `🛡️ **لديك درع نشط بالفعل!**`, ephemeral: true });
                                    processingUsers.delete(i.user.id); return; 
                                }

                                let skillNameUsed = "مهارة";
                                let skillObj = { id: skillId, name: 'Skill', effectValue: 0 };
                                
                                if (!skillId.startsWith('class_') && skillId !== 'class_special_skill' && skillId !== 'skill_secret_owner' && skillId !== 'skill_owner_leave') {
                                     if (p.skills[skillId]) skillObj = p.skills[skillId];
                                }

                                const monsterHpBefore = monster.hp;

                                const res = handleSkillUsage(p, { ...skillObj, id: skillId }, monster, log, threadChannel, players);
                                
                                const dmgDealt = monsterHpBefore - monster.hp;

                                if (dmgDealt > 0) {
                                    let cappedDmg = dmgDealt;
                                    if (p.isSealed) cappedDmg = Math.floor(cappedDmg * p.sealMultiplier);
                                    if (floor <= 5 && cappedDmg > 47) cappedDmg = 47;
                                    else if (floor <= 10 && cappedDmg > 88) cappedDmg = 88;
                                    else if (floor <= 14 && cappedDmg > 120) cappedDmg = 120;
                                    if (cappedDmg < 30) cappedDmg = 30;
                                    
                                    monster.hp = Math.max(0, monsterHpBefore - cappedDmg);

                                    if (log.length > 0) {
                                        const lastLogIdx = log.length - 1;
                                        if (cappedDmg !== dmgDealt) {
                                             log[lastLogIdx] = log[lastLogIdx].replace(dmgDealt.toString(), cappedDmg.toString());
                                             if (p.isSealed) log[lastLogIdx] += ` (مختوم)`;
                                             else if (cappedDmg > dmgDealt) log[lastLogIdx] += ` (⬆️)`; 
                                             else log[lastLogIdx] += ` (⬇️)`; 
                                        }
                                    }
                                }

                                if (res && res.error) {
                                    await selection.editReply({ content: res.error, components: [] }).catch(()=>{});
                                    processingUsers.delete(i.user.id); return;
                                }
                                
                                if (res && res.name) skillNameUsed = res.name;
                                else if (skillObj.name !== 'Skill') skillNameUsed = skillObj.name;

                                p.threat = (p.threat || 0) + 100;

                                actedPlayers.push(p.id); p.skipCount = 0; 
                                await selection.editReply({ content: `✅ تم استخـدام: ${skillNameUsed}`, components: [] }).catch(()=>{});
                                
                                await battleMsg.edit({ 
                                    content: '', 
                                    embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
                                }).catch(()=>{});

                                checkBossPhase(monster, log); 
                                
                                const deadThisTurn = players.filter(pl => pl.hp <= 0 && !pl.isDead);
                                if (deadThisTurn.length > 0) {
                                    for (const deadP of deadThisTurn) {
                                        deadP.isDead = true;
                                        await threadChannel.send(`💀 **${deadP.name}** سقط في أرض المعركة!`).catch(()=>{});
                                        if (deadP.class === 'Priest') {
                                            players.forEach(ally => {
                                                if (!ally.isDead && ally.id !== deadP.id) {
                                                    const healAmt = Math.floor(ally.maxHp * 0.20);
                                                    ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                                                }
                                            });
                                            await threadChannel.send(`✨ **سـقـط الكـاهن وعـالج الفريـق عـلى الرمـق الاخيـر ✨**`).catch(()=>{});
                                        }
                                    }
                                }
                                
                                // ✅ إنهاء الدور إذا الكل لعب
                                if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimeout); collector.stop('turn_end'); }
                                if (players.every(p => p.isDead)) { ongoing = false; collector.stop('all_dead'); return; }
                                if (monster.hp <= 0) { monster.hp = 0; ongoing = false; collector.stop('monster_dead'); return; }

                            } catch (err) { processingUsers.delete(i.user.id); return; }
                        } 
                        else if (i.customId === 'heal') {
                            const potionRow = buildPotionSelector(p, sql, guild.id);
                            if (!potionRow) {
                                await i.followUp({ content: "❌ لا تملك جرعات في حقيبتك!", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const potionMsg = await i.followUp({ content: "🧪 **اختر الجرعة:**", components: [potionRow], ephemeral: true });
                                const selection = await potionMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 20000 }); 
                                await selection.deferUpdate().catch(()=>{});
                                
                                const selectedValue = selection.values[0];

                                if (selectedValue === 'buy_potions_action') {
                                    const userLevelData = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(p.id, guild.id);
                                    const currentMora = userLevelData ? userLevelData.mora : 0;

                                    const shopOptions = potionItems.map(pot => ({
                                        label: `${pot.name} (${pot.price.toLocaleString()} مورا)`,
                                        value: pot.id,
                                        description: pot.description ? pot.description.substring(0, 50) : "جرعة مفيدة",
                                        emoji: pot.emoji
                                    }));

                                    const shopRow = new ActionRowBuilder().addComponents(
                                        new StringSelectMenuBuilder()
                                            .setCustomId('shop_buy_select')
                                            .setPlaceholder('اختر الجرعة للشراء...')
                                            .addOptions(shopOptions)
                                    );

                                    const shopMsg = await selection.followUp({
                                        content: `💰 **متجر الجرعات السريع**\nرصيدك الحالي: **${currentMora.toLocaleString()}** ${EMOJI_MORA}\nاختر الجرعة التي تريد شراءها:`,
                                        components: [shopRow],
                                        ephemeral: true
                                    });

                                    try {
                                        const buyInteraction = await shopMsg.awaitMessageComponent({ time: 15000 });
                                        await buyInteraction.deferUpdate();
                                        
                                        const itemID = buyInteraction.values[0];
                                        const targetItem = potionItems.find(x => x.id === itemID);

                                        if (currentMora < targetItem.price) {
                                            await buyInteraction.followUp({ content: `❌ **لا تملك مورا كافية!** تحتاج ${targetItem.price} مورا.`, ephemeral: true });
                                        } else {
                                            sql.prepare("UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?").run(targetItem.price, p.id, guild.id);
                                            const existingItem = sql.prepare("SELECT * FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(p.id, guild.id, targetItem.id);
                                            if (existingItem) {
                                                sql.prepare("UPDATE user_inventory SET quantity = quantity + 1 WHERE id = ?").run(existingItem.id);
                                            } else {
                                                sql.prepare("INSERT INTO user_inventory (guildID, userID, itemID, quantity) VALUES (?, ?, ?, 1)").run(guild.id, p.id, targetItem.id);
                                            }

                                            await buyInteraction.followUp({ content: `✅ **تم شراء ${targetItem.name}!**\nيمكنك الآن فتح قائمة الجرعات مرة أخرى لاستخدامها.`, ephemeral: true });
                                        }
                                    } catch (e) {
                                        await shopMsg.edit({ content: "⏰ انتهى وقت الشراء.", components: [] }).catch(()=>{});
                                    }

                                    processingUsers.delete(i.user.id);
                                    return; 
                                }

                                const potionId = selectedValue.replace('use_potion_', '');
                                
                                if (potionId === 'potion_titan') {
                                    p.titanPotionUses = p.titanPotionUses || 0;
                                    if (p.titanPotionUses >= 3) {
                                        await selection.followUp({ content: "🚫 **لقد استهلكت الحد الأقصى (3) من جرعة العملاق في هذا الدانجون!**", ephemeral: true });
                                        processingUsers.delete(i.user.id);
                                        return;
                                    }
                                    p.titanPotionUses++; 
                                }
                                
                                if (sql.open) {
                                    sql.prepare("UPDATE user_inventory SET quantity = quantity - 1 WHERE userID = ? AND guildID = ? AND itemID = ?").run(p.id, guild.id, potionId);
                                }

                                let actionMsg = "";
                                if (potionId === 'potion_heal') {
                                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                                    actionMsg = "🧪 استعاد 50% HP!";
                                    const threatGen = Math.floor((p.maxHp * 0.5) / 2);
                                    p.threat = (p.threat || 0) + threatGen;

                                } else if (potionId === 'potion_reflect') {
                                    p.effects.push({ type: 'rebound_active', val: 0.5, turns: 2 });
                                    actionMsg = "🌵 جهز درع الأشواك!";
                                } else if (potionId === 'potion_time') {
                                    p.special_cooldown = 0; p.skillCooldowns = {};
                                    actionMsg = "⏳ شرب جرعة الزمن وأعاد شحن مهاراته!";
                                } else if (potionId === 'potion_titan') {
                                    p.maxHp *= 2; p.hp = p.maxHp;
                                    p.effects.push({ type: 'titan', floors: 5 }); 
                                    monster.targetFocusId = p.id;
                                    actionMsg = `🔥 تحول لعملاق! (يستمر لـ 5 طوابق) (${p.titanPotionUses}/3)`;
                                    p.threat = (p.threat || 0) + 1000;

                                } else if (potionId === 'potion_sacrifice') {
                                    p.hp = 0; p.isDead = true; p.isPermDead = true; p.deathFloor = floor; 
                                    players.forEach(ally => {
                                        if (ally.id !== p.id) {
                                            ally.isDead = false; ally.isPermDead = false; ally.reviveCount = 0;
                                            ally.hp = ally.maxHp; ally.effects = [];
                                        }
                                    });
                                    actionMsg = "💀 شرب جرعة التضحية، تحللت جثته وأنقذ الجميع!";
                                    threadChannel.send(`💀 **${p.name}** شرب جرعة التضحية، تحللت جثته وأنقذ الفريق!`).catch(()=>{});
                                    handleLeaderSuccession(players, log);
                                }
                                log.push(`**${p.name}**: ${actionMsg}`);
                                actedPlayers.push(p.id); p.skipCount = 0; 
                                await selection.editReply({ content: `✅ ${actionMsg}`, components: [] }).catch(()=>{});
                                
                                await battleMsg.edit({ 
                                    content: '', 
                                    embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
                                }).catch(()=>{});

                                saveDungeonState(sql, threadChannel.id, guild.id, hostId, {
                                    floor, players, merchantState, retreatedPlayers, isTrapActive,
                                    retreatState, 
                                    loot: { coins: totalAccumulatedCoins, xp: totalAccumulatedXP },
                                    themeName: theme.name,
                                    monsterData: monster
                                });

                                const deadThisTurn = players.filter(pl => pl.hp <= 0 && !pl.isDead);
                                if (deadThisTurn.length > 0) {
                                    for (const deadP of deadThisTurn) {
                                        deadP.isDead = true;
                                        await threadChannel.send(`💀 **${deadP.name}** سقط في أرض المعركة!`).catch(()=>{});
                                        if (deadP.class === 'Priest') {
                                            players.forEach(ally => {
                                                if (!ally.isDead && ally.id !== deadP.id) {
                                                    const healAmt = Math.floor(ally.maxHp * 0.20);
                                                    ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                                                }
                                            });
                                            await threadChannel.send(`✨ **سـقـط الكـاهن وعـالج الفريـق عـلى الرمـق الاخيـر ✨**`).catch(()=>{});
                                        }
                                    }
                                }
                                
                                // ✅ إنهاء الدور إذا الكل لعب
                                if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimeout); collector.stop('turn_end'); }
                                if (players.every(p => p.isDead)) { ongoing = false; collector.stop('all_dead'); return; }
                                if (monster.hp <= 0) { monster.hp = 0; ongoing = false; collector.stop('monster_dead'); return; }
                            } catch (err) { processingUsers.delete(i.user.id); return; }
                        } 
                        else if (i.customId === 'atk' || i.customId === 'def') {
                            actedPlayers.push(p.id); p.skipCount = 0; 
                            if (i.customId === 'atk') {
                                let canAttack = true;
                                const confusion = p.effects.find(e => e.type === 'confusion');
                                if (confusion && Math.random() < confusion.val) {
                                    canAttack = false;
                                    const selfDmg = Math.floor(p.maxHp * 0.15); 
                                    applyDamageToPlayer(p, selfDmg);
                                    log.push(`😵 **${p.name}** في حالة ارتباك وضرب نفسه! (-${selfDmg})`);
                                } 
                                else if (p.effects.some(e => e.type === 'blind' && Math.random() < e.val)) {
                                    canAttack = false;
                                    log.push(`☁️ **${p.name}** هاجم ولكن أخطأ الهدف بسبب العمى!`);
                                }

                                if (canAttack) {
                                    const isOwner = p.id === OWNER_ID;
                                    const monsterHpBefore = monster.hp;
                                    const result = weaponCalculator.executeWeaponAttack(p, monster, isOwner);
                                    
                                    let finalDmg = result.damage;
                                    const atkBuff = p.effects.find(e => e.type === 'atk_buff');
                                    if (atkBuff) finalDmg = Math.floor(finalDmg * (1 + atkBuff.val));
                                    const critBuff = p.effects.find(e => e.type === 'crit_buff');
                                    if (critBuff) finalDmg = Math.floor(finalDmg * 1.5);
                                    const weakness = monster.effects.find(e => e.type === 'weakness');
                                    if (weakness) finalDmg = Math.floor(finalDmg * (1 + weakness.val));

                                    if (finalDmg > 0) {
                                        let cappedDmg = finalDmg;
                                        if (p.isSealed) cappedDmg = Math.floor(cappedDmg * p.sealMultiplier);
                                        if (cappedDmg < 30) cappedDmg = 30;
                                        if (floor <= 5 && cappedDmg > 47) cappedDmg = 47;
                                        else if (floor <= 10 && cappedDmg > 88) cappedDmg = 88;
                                        else if (floor <= 14 && cappedDmg > 120) cappedDmg = 120;

                                        monster.hp = Math.max(0, monsterHpBefore - cappedDmg);
                                        
                                        result.log = result.log.replace(result.damage.toString(), cappedDmg.toString());
                                        if (p.isSealed) result.log += ` (مختوم)`;
                                        else if (cappedDmg > result.damage) result.log += ` (⬆️)`;
                                        else if (cappedDmg < result.damage) result.log += ` (⬇️)`;

                                        log.push(result.log);
                                        let threatGen = cappedDmg; 
                                        if (p.class === 'Tank') threatGen *= 3; 
                                        p.threat = (p.threat || 0) + threatGen;
                                        checkBossPhase(monster, log);
                                    } else {
                                        log.push(result.log);
                                    }
                                }
                            } else if (i.customId === 'def') {
                                p.defending = true; log.push(`🛡️ **${p.name}** يدافع!`);
                                if (p.class === 'Tank') p.threat = (p.threat || 0) + 200;
                            }
                             
                            await battleMsg.edit({ 
                                content: '', // ✅ تم إزالة النص
                                embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
                            }).catch(()=>{});

                            const deadThisTurn = players.filter(pl => pl.hp <= 0 && !pl.isDead);
                            if (deadThisTurn.length > 0) {
                                for (const deadP of deadThisTurn) {
                                    deadP.isDead = true;
                                    await threadChannel.send(`💀 **${deadP.name}** سقط في أرض المعركة!`).catch(()=>{});
                                    if (deadP.class === 'Priest') {
                                        players.forEach(ally => {
                                            if (!ally.isDead && ally.id !== deadP.id) {
                                                const healAmt = Math.floor(ally.maxHp * 0.20);
                                                ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                                            }
                                        });
                                        await threadChannel.send(`✨ **سـقـط الكـاهن وعـالج الفريـق عـلى الرمـق الاخيـر ✨**`).catch(()=>{});
                                    }
                                }
                            }

                            // ✅ إنهاء الدور إذا الكل لعب
                            if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimeout); collector.stop('turn_end'); }
                        }

                        if (players.every(p => p.isDead)) { ongoing = false; collector.stop('all_dead'); return; }
                        if (monster.hp <= 0) { monster.hp = 0; ongoing = false; collector.stop('monster_dead'); return; }
                    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }
                });
                
                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            }); 

        }

        if (monster.hp <= 0) { 
            ongoing = false; 
            await battleMsg.edit({ 
                content: `**☠️ سقط الوحش!**`,
                components: [] 
            }).catch(()=>{}); 
        }

        players.forEach(p => { 
            for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
            if (p.special_cooldown > 0) p.special_cooldown--; 
            
            p.effects = p.effects.filter(e => { 
                if (e.floors) { 
                    return true; 
                }
                e.turns--; 
                if (e.turns <= 0) return false; 
                return true; 
            });
        });

        if (turnCount % 3 === 0 && ongoing) {
            try {
                await battleMsg.delete();
                battleMsg = await threadChannel.send({ 
                    content: '', // ✅ تم إزالة النص
                    embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                    components: generateBattleRows() 
                });
            } catch(e) { break; } // ✅ الآن هذا الكود صحيح
        }

        if (monster.hp > 0 && ongoing) {
            turnCount++;
            saveDungeonState(sql, threadChannel.id, guild.id, hostId, {
                floor, players, merchantState, retreatedPlayers, isTrapActive,
                retreatState, 
                loot: { coins: totalAccumulatedCoins, xp: totalAccumulatedXP },
                themeName: theme.name,
                monsterData: monster
            });

            ongoing = await processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel);
            if (ongoing) handleLeaderSuccession(players, log);
        }
    } // ✅ End of For Loop

    if (players.every(p => p.isDead)) {
        const finalFloor = isTrapActive ? trapStartFloor : floor;
        deleteDungeonState(sql, threadChannel.id); 
        statusCollector.stop(); 
        await handleTeamWipe(players, floor, sql, guild.id);
        await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, finalFloor, "lose", sql, guild.id, hostId, activeDungeonRequests);
        return; 
    }
      
    let baseMora = Math.floor(getBaseFloorMora(floor));
    let floorXp = Math.floor(baseMora * 0.03);  
    players.forEach(p => { if (!p.isDead) { p.loot.mora += baseMora; p.loot.xp += floorXp; } });
    totalAccumulatedCoins += baseMora;
    totalAccumulatedXP += floorXp;

    // ==========================================
    // 🛡️ نقاط الأمان والمكافآت (Checkpoints)
    // ==========================================

    if (floor === 20) {
        snapshotLootAtFloor20(players);
        await threadChannel.send(`🛡️ **نـقـــطـــة أمـــــان (20)!** تم حفظ الغنائم حتى هذه اللحظة.`).catch(()=>{});
    }

    if (floor === 50) {
        snapshotLootAtFloor20(players); 
        await threadChannel.send(`🛡️ **نـقـــطـــة أمـــــان كـبـرى (50)!**\nاستعدوا.. ما بعد هذا الطابق هو الجحيم الحقيقي!`).catch(()=>{});
    }

    if (floor === 51) {
        players.forEach(p => {
            if (!p.isDead) {
                const hpBonus = Math.floor(p.maxHp * 0.50);
                p.maxHp += hpBonus;
                p.hp += hpBonus; 
                p.effects.push({ type: 'atk_buff', val: 0.30, turns: 999 });
            }
        });

        await threadChannel.send({
            content: `⚡ **ارتقاء الأبطال!** ⚡\nبسبب تجاوزكم منتصف الدانجون، زادت قوتكم بشكل هائل لمواجهة المخاطر القادمة:\n❤️ **+50% Max HP**\n⚔️ **+30% Attack Damage**`
        }).catch(()=>{});
    }

    players.forEach(p => {
        if (!p.isDead) {
            const healAmount = Math.floor(p.maxHp * 0.30);
            p.hp = Math.min(p.maxHp, Math.floor(p.hp + healAmount));
            if (isNaN(p.hp)) p.hp = p.maxHp;

            p.effects = p.effects.filter(e => {
                if (e.floors) {
                    e.floors--;
                    if (e.floors <= 0) {
                        if (e.type === 'titan') {
                            p.maxHp = Math.floor(p.maxHp / 2);
                            if (p.hp > p.maxHp) p.hp = p.maxHp;
                            threadChannel.send(`✨ **${p.name}** عاد لحجمه الطبيعي وتلاشى مفعول العملاق.`).catch(()=>{});
                        }
                        return false; 
                    }
                }
                return true;
            });
        }
    });

    let canRetreat = false;

    if (floor <= 20) {
        canRetreat = true;
    } 
    else if (floor >= 30 && floor <= 40) {
        if (!retreatState.range_30_40 && Math.random() < 0.25) { 
            canRetreat = true;
            retreatState.range_30_40 = true; 
        }
    }
    else if (floor >= 41 && floor <= 50) {
        if (!retreatState.range_41_50 && Math.random() < 0.25) {
            canRetreat = true;
            retreatState.range_41_50 = true;
        }
    }
    else if (floor >= 51 && floor <= 70) {
        if (!retreatState.range_51_70 && Math.random() < 0.15) { 
            canRetreat = true;
            retreatState.range_51_70 = true;
        }
    }
    else if (floor >= 71 && floor <= 90) {
        if (!retreatState.range_71_90 && Math.random() < 0.15) {
            canRetreat = true;
            retreatState.range_71_90 = true;
        }
    }

    let restDesc = `✶ نجحتـم في تصفية الطابق الـ: **${floor}**\n✶ تم استعادة صحة المغامرين بنسبة **%30**\n\n**✶ الغنـائـم المتراكمة:**\n✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}\n✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}`;

    const restRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success)
    );

    if (floor === 20) {
         restDesc += `\n\n✥ **تحذيـر:** التوغل اكثر بالدانجون محفوف بالمخاطر الاستمرار الان سيمنعكم من الانسحـاب في معظم الطوابق`;
    } else if (floor > 20) {
         if (canRetreat) {
             restDesc += `\n\n✨ **فرصة نادرة:** وجـدتـم بوابـة انسـحـاب! لن تظهر مجدداً في هذا النطاق`;
         } else {
             restDesc += `\n\n✥ **تحذيـر:** المنطقة خطرة - الانسحاب غير متاح في هذا الطابق!`;
         }
    } else {
        restDesc += `\n\n- القرار بيد **القائد** للاستمرار أو الانسحاب!`;
    }

    if (canRetreat) {
         restRow.addComponents(new ButtonBuilder().setCustomId('retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger));
    }

    if (floor === 99) {
        restDesc += `\n\n⚠️💀 **تحذيـــر نهائـــي** 💀⚠️\nأنتم على أعتاب العرش... **الإمبراطور موراكس** بانتظاركم في الطابق القادم! لا تراجع بعد الآن!`;
    }

    const restEmbed = new EmbedBuilder()
        .setTitle('❖ استـراحـة بيـن الطـوابـق')
        .setDescription(restDesc)
        .setColor(Colors.Red)
        .setImage('https://i.postimg.cc/KcJ6gtzV/22.jpg');

    let restMsg;
    try {
        restMsg = await threadChannel.send({ 
            content: '', 
            embeds: [restEmbed], 
            components: [restRow] 
        });
    } catch (err) { break; }

    const warningTimeout = setTimeout(() => {
        threadChannel.send("✶ الدانجـون سيبتلـعـكم بسبب الخمـول امام القائد 60 ثانية للاستمرار").catch(()=>{});
    }, 60000); 
      
    const decision = await new Promise(res => {
        const decCollector = restMsg.createMessageComponentCollector({ time: 120000 }); // 120 ثانية
        decCollector.on('collect', async i => {
            clearTimeout(warningTimeout); 

            if (i.customId === 'continue') {
                let p = players.find(pl => pl.id === i.user.id);
                if (!p || p.class !== 'Leader') return i.reply({ content: "🚫 **فقط القائد يمكنه اختيار الاستمرار!**", ephemeral: true });
                await i.deferUpdate(); 
                return decCollector.stop('continue');
            }

            if (i.customId === 'retreat' && canRetreat) {
                let p = players.find(pl => pl.id === i.user.id);
                if (p && p.class === 'Leader') {
                    await i.deferUpdate();
                    return decCollector.stop('retreat');
                } else {
                    const pIndex = players.findIndex(pl => pl.id === i.user.id);
                    if (pIndex > -1) {
                        const leavingPlayer = players[pIndex];
                        leavingPlayer.retreatFloor = floor;
                        
                        const rewards = await handleMemberRetreat(leavingPlayer, floor, sql, guild.id, threadChannel);
                        
                        retreatedPlayers.push(leavingPlayer);
                        players.splice(pIndex, 1); 
                        
                        await i.reply({ content: `👋 **انسحبت!** وحصلت على: **${rewards.mora}** مورا و **${rewards.xp}** XP.`, ephemeral: true });
                        await threadChannel.send(`💨 **${leavingPlayer.name}** انسحب واكتفى بغنائمه!`).catch(()=>{});
                        
                        if (leavingPlayer.class === 'Leader') handleLeaderSuccession(players, log);
                        if (players.length === 0) decCollector.stop('retreat');
                    }
                }
            }
        });
        decCollector.on('end', (c, reason) => { clearTimeout(warningTimeout); res(reason); });
    });

    await restMsg.edit({ components: [] }).catch(()=>{});

    if (decision === 'time') { 
        deleteDungeonState(sql, threadChannel.id); 
        
        players.forEach(p => { 
            p.isDead = true; 
            p.hp = 0; 
            p.deathFloor = floor; 
        });

        await threadChannel.send(`💀 **انتهى الوقت!** ابتلع ظلام الدانجون الفريق بأكمله...`).catch(()=>{});
        
        statusCollector.stop(); 
        await handleTeamWipe(players, floor, sql, guild.id);
        await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", sql, guild.id, hostId, activeDungeonRequests);
        return; 
    } 
    else if (decision === 'retreat') {
        deleteDungeonState(sql, threadChannel.id); 
        statusCollector.stop(); 
        await handleLeaderRetreat(players, sql, guild.id);
        await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
        return;
    } 
    else if (decision === 'continue') {
        if (floor > 10 && floor < 90 && Math.random() < 0.0002) { 
            isTrapActive = true;
            trapStartFloor = floor;
            const minTarget = floor + 2;
            const maxTarget = 90; 
            const targetFloor = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
            floor = targetFloor - 1; 

            if (targetFloor >= 19) {
                let sealBroken = false;
                players.forEach(p => {
                    if (p.isSealed) {
                        p.isSealed = false;
                        p.sealMultiplier = 1.0;
                        sealBroken = true;
                    }
                });
                if (sealBroken) {
                    await threadChannel.send(`🔓 **بسبب الضغط الهائل للانتقال عبر الأبعاد.. تحطمت الأختام عن الجميع واستعدتم كامل قوتكم!**`).catch(()=>{});
                }
            }

            const trapEmbed = new EmbedBuilder()
                .setTitle('⚠️ انـذار: شـذوذ زمـكـانـي!')
                .setDescription(`🌀 **لقد وقعتم في فخ الأبعاد!**\nتم قذفكم قسراً للأمام إلى الطابق **${targetFloor}**!\n\n☠️ الوحوش هنا لا ترحم...!`)
                .setColor(Colors.DarkRed)
                .setThumbnail('https://media.discordapp.net/attachments/1145327691772481577/115000000000000000/blackhole.gif'); 
            await threadChannel.send({ content: `**🌀 شذوذ زمكاني!**`, embeds: [trapEmbed] }).catch(()=>{});
        } else {
            await threadChannel.send(`⚔️ **يتوغل الفريق بالدانجون نحو طوابق أعمق...**`).catch(()=>{});

            const canTriggerEvent = (floor - lastEventFloor) > 4;
            if (canTriggerEvent && floor > 5 && !isTrapActive && Math.random() < 0.30) {
                let eventToTrigger = '';
                if (lastEventType === 'merchant') eventToTrigger = 'chest'; 
                else if (lastEventType === 'chest') eventToTrigger = 'merchant'; 
                else eventToTrigger = Math.random() < 0.5 ? 'merchant' : 'chest';

                if (eventToTrigger === 'merchant') {
                    await triggerMysteryMerchant(threadChannel, players, sql, guild.id, merchantState);
                    lastEventType = 'merchant'; lastEventFloor = floor;
                } else {
                    await triggerMimicChest(threadChannel, players);
                    lastEventType = 'chest'; lastEventFloor = floor;
                }
            }
        }
    }
} // End of For Loop

const alivePlayers = players.filter(p => !p.isDead);
if (alivePlayers.length > 0) {
    
    deleteDungeonState(sql, threadChannel.id);
    statusCollector.stop(); 

    const winEmbed = new EmbedBuilder()
        .setTitle('👑 اعتـراف الإمبـراطـور: اجتيـاز الاختبـار الأعظـم 👑')
        .setDescription(`**"أحسنتـم... لم أتوقع أن تصمدوا أمامي لكل هذا الوقت."**\n\nتـمت تصفيـة الدانجـون بنجـاح، فالتسجـل امبراطوريتـنـا اسمأئكـم بين العظمـاء!`)
        .setColor(Colors.Gold)
        .setImage('https://i.postimg.cc/Hx8d7XpD/morax.jpg') 
        .setTimestamp();

    const mentions = alivePlayers.map(p => `<@${p.id}>`).join(' ');

    try {
        await threadChannel.send({ content: `🎉 ${mentions}`, embeds: [winEmbed] });
    } catch (err) {
        console.log("⚠️ تعذر إرسال رسالة الفوز (الثريد محذوف).");
    }

    await handleLeaderRetreat(alivePlayers, sql, guild.id);
    
    await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, 100, "win", sql, guild.id, hostId, activeDungeonRequests);
}

} // End of runDungeon function

module.exports = { runDungeon };
