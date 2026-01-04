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
    ownerSkills 
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

// 🔥 استدعاء ملف الصناديق والتاجر 🔥
const { triggerMimicChest } = require('./dungeon/mimic-chest');
const { triggerMysteryMerchant } = require('./dungeon/mystery-merchant');

// ============================================================
// 🔥 استدعاءات التنظيم الجديدة (CORE, ACTIONS, LOGIC) 🔥
// ============================================================
const { cleanName, checkDeaths, handleLeaderSuccession } = require('./dungeon/core/battle-utils'); 
const { setupPlayers } = require('./dungeon/core/setup');
const { sendEndMessage } = require('./dungeon/core/end-game');
const { handleOwnerMenu } = require('./dungeon/actions/owner-menu');
const { processMonsterTurn } = require('./dungeon/logic/monster-turn');

// 🔥🔥🔥 استدعاء ملف توزيع الجوائز (The Reward Handler) 🔥🔥🔥
const { 
    handleMemberRetreat, 
    handleTeamWipe, 
    handleLeaderRetreat, 
    snapshotLootAtFloor20 
} = require('./dungeon/core/rewards');

// --- 💾 دوال الحفظ والحذف (Save System) 💾 ---

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

// --- Main Dungeon Execution Logic ---

async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId, partyClasses, activeDungeonRequests, resumeData = null) {
    const guild = threadChannel.guild;
     
    if (!sql || !sql.open) {
        return threadChannel.send("⚠️ **خطأ تقني:** قاعدة البيانات غير متصلة حالياً، الرجاء المحاولة لاحقاً.").catch(() => {});
    }
    ensureInventoryTable(sql); 

    // تعريف المتغيرات
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
    let players = [];
    let startFloor = 1;
    let totalAccumulatedCoins = 0;
    let totalAccumulatedXP = 0;

    // ============================================================
    // 🔄 منطق الاستكمال (Resume Logic) 🔄
    // ============================================================
    if (resumeData) {
        players = resumeData.players;
        merchantState = resumeData.merchantState;
        totalAccumulatedCoins = resumeData.loot.coins;
        totalAccumulatedXP = resumeData.loot.xp;
        startFloor = resumeData.floor;
        retreatedPlayers = resumeData.retreatedPlayers || [];
        isTrapActive = resumeData.isTrapActive || false;
        
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
                 threadChannel.send(`✶ <@${p.id}> تـم ختـم قوتك الى الطابـق 18 لن تتمكن من استعمال قوتك جيدا, الطوابق الدنيا لا تتحمل جبروتك`).catch(() => {});
            }
        });
    }

    const maxFloors = 100; 

    for (let floor = startFloor; floor <= maxFloors; floor++) {
        
        const currentState = {
            floor: floor,
            players: players,
            merchantState: merchantState,
            retreatedPlayers: retreatedPlayers,
            isTrapActive: isTrapActive,
            loot: { coins: totalAccumulatedCoins, xp: totalAccumulatedXP },
            themeName: theme.name 
        };
        saveDungeonState(sql, threadChannel.id, guild.id, hostId, currentState);

        // 🔥 فحص الموت الجماعي قبل بداية الطابق
        if (players.length === 0 || players.every(p => p.isDead)) {
            deleteDungeonState(sql, threadChannel.id); 
            // 💀 توزيع جوائز الخسارة (Wipe Logic)
            await handleTeamWipe(players, floor, sql, guild.id);
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break; 
        }

        // --- منطق التاجر والقفز ---
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
                console.log("Error sending message (Unknown Channel likely):", err.message);
                break; 
            }
            
            currentState.floor = floor;
            saveDungeonState(sql, threadChannel.id, guild.id, hostId, currentState);
            
            continue; 
        }

        if (floor === 15) {
            players.forEach(p => {
                if (p.isSealed && !p.isDead) {
                    p.sealMultiplier = 0.5; 
                    threadChannel.send(`✶ <@${p.id}> كسرت الختم بشكل جزئي عن قوتـك .. استـمر !`).catch(() => {});
                }
            });
        }
        if (floor === 19) {
            players.forEach(p => {
                if (p.isSealed && !p.isDead) {
                    p.isSealed = false; 
                    p.sealMultiplier = 1.0;
                    threadChannel.send(`✶ <@${p.id}> تـم كـسـر الخـتم عنك واطلق العنان لقوتك، لك الآن الحُرّيـة الكامـلة في استعمالها`).catch(() => {});
                }
            });
        }

        // 🔥🔥🔥 منطق درع المرتزقة (الاستمرار لمدة 5 طوابق فقط) 🔥🔥🔥
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
                p.effects = p.effects.filter(e => ['poison', 'atk_buff', 'weakness', 'titan'].includes(e.type));
                p.defending = false; 
                p.summon = null; 
            } 
        }

        // 🔥🔥🔥 تحديد نوع الوحش 🔥🔥🔥
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
        
        const randomMob = getRandomMonster(monsterType, theme, floor);

        let finalHp, finalAtk;
        
        if (floor <= 10) {
            finalHp = 300 + ((floor - 1) * 150);
            finalAtk = 20 + (floor * 5);
        } else if (floor <= 20) {
            finalHp = 2000 + ((floor - 10) * 400);
            finalAtk = 80 + ((floor - 10) * 15);
        } else if (floor <= 30) {
            finalHp = 8000 + ((floor - 20) * 1000);
            finalAtk = 250 + ((floor - 20) * 30);
        } else {
            const tier = floor - 30;
            finalHp = 20000 + (Math.pow(tier, 1.8) * 200); 
            finalAtk = 600 + (tier * 20); 
        }

        if (floor === 100) {
            finalHp = 1000000; 
            finalAtk = 15000;  
        }

        let monster = {
            name: floor === 100 ? randomMob.name : `${randomMob.name} (Lv.${floor})`, 
            hp: Math.floor(finalHp), 
            maxHp: Math.floor(finalHp), 
            atk: Math.floor(finalAtk), 
            enraged: false, effects: [], targetFocusId: null, frozen: false 
        };

        if (merchantState.weaknessActive) {
            monster.effects.push({ type: 'weakness', val: 0.50, turns: 99 });
            merchantState.weaknessActive = false;
        }

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.maxHp.toLocaleString()} | DMG: ${monster.atk})`];
        if (monster.effects.some(e => e.type === 'weakness')) log.push(`👁️ **تم كشف نقطة ضعف الوحش!** (+50% ضرر إضافي)`);

        let ongoing = true;
        let turnCount = 0;

        let battleMsg;
        try {
            battleMsg = await threadChannel.send({ 
                embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                components: generateBattleRows() 
            });
        } catch (err) {
            console.log("Dungeon Stop: Thread likely deleted.");
            break;
        }

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
                        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});
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

                                let originalAtk = p.atk;
                                
                                if (p.isSealed) {
                                    p.atk = Math.floor(p.atk * p.sealMultiplier); 
                                    const isHealSkill = (skillObj.type === 'HEAL' || skillObj.type === 'heal');
                                    if (skillObj.effectValue && !isHealSkill) {
                                        skillObj = { ...skillObj, effectValue: Math.floor(skillObj.effectValue * p.sealMultiplier) };
                                    }
                                }

                                // 🔥🔥🔥 كبت الضرر للمهارات في الطوابق الأولى 🔥🔥🔥
                                if (floor <= 5 && p.atk > 47) p.atk = 47;
                                else if (floor <= 10 && p.atk > 88) p.atk = 88;
                                else if (floor <= 14 && p.atk > 120) p.atk = 120;
                                // 🔥🔥🔥 نهاية كبت الضرر للمهارات 🔥🔥🔥

                                const res = handleSkillUsage(p, { ...skillObj, id: skillId }, monster, log, threadChannel, players);
                                
                                p.atk = originalAtk;

                                if (res && res.error) {
                                    await selection.editReply({ content: res.error, components: [] }).catch(()=>{});
                                    processingUsers.delete(i.user.id); return;
                                }
                                
                                if (res && res.name) skillNameUsed = res.name;
                                else if (skillObj.name !== 'Skill') skillNameUsed = skillObj.name;

                                // 🔥 حساب التهديد للمهارات 🔥
                                p.threat = (p.threat || 0) + 100;

                                actedPlayers.push(p.id); p.skipCount = 0; 
                                await selection.editReply({ content: `✅ تم استخـدام: ${skillNameUsed}`, components: [] }).catch(()=>{});
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                                checkBossPhase(monster, log); 
                                checkDeaths(players, floor, log, threadChannel);
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
                                const selection = await potionMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 15000 });
                                await selection.deferUpdate().catch(()=>{});
                                const potionId = selection.values[0].replace('use_potion_', '');
                                
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
                                    
                                    // 🔥 تهديد العلاج 🔥
                                    const threatGen = Math.floor((p.maxHp * 0.5) / 2);
                                    p.threat = (p.threat || 0) + threatGen;

                                } else if (potionId === 'potion_reflect') {
                                    p.effects.push({ type: 'reflect', val: 0.5, turns: 2 });
                                    actionMsg = "🌵 جهز درع الأشواك!";
                                } else if (potionId === 'potion_time') {
                                    p.special_cooldown = 0; p.skillCooldowns = {};
                                    actionMsg = "⏳ شرب جرعة الزمن وأعاد شحن مهاراته!";
                                } else if (potionId === 'potion_titan') {
                                    p.maxHp *= 2; p.hp = p.maxHp;
                                    p.effects.push({ type: 'titan', floors: 5 }); 
                                    monster.targetFocusId = p.id;
                                    actionMsg = `🔥 تحول لعملاق! (يستمر لـ 5 طوابق) (${p.titanPotionUses}/3)`;
                                    
                                    // 🔥 التايتن يولد تهديد هائل فورياً
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
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                                checkDeaths(players, floor, log, threadChannel);
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
                                    let atkMultiplier = 1.0;
                                    p.effects.forEach(e => { if(e.type === 'atk_buff') atkMultiplier += e.val; });
                                    let currentAtk = Math.floor(p.atk * atkMultiplier);
                                     
                                    if (p.isSealed) currentAtk = Math.floor(currentAtk * p.sealMultiplier); 

                                    const baseCrit = p.critRate || 0.2;
                                    const isCrit = Math.random() < baseCrit;
                                     
                                    let dmg = Math.floor(currentAtk * (0.9 + Math.random() * 0.2));
                                    if (isCrit) dmg = Math.floor(dmg * 1.5);

                                    // 🔥🔥🔥 كبت الضرر للهجوم العادي في الطوابق الأولى 🔥🔥🔥
                                    if (floor <= 5 && dmg > 47) dmg = 47;
                                    else if (floor <= 10 && dmg > 88) dmg = 88;
                                    else if (floor <= 14 && dmg > 120) dmg = 120;
                                    // 🔥🔥🔥 نهاية كبت الضرر 🔥🔥🔥

                                    monster.hp -= dmg; p.totalDamage += dmg; 
                                    
                                    // 🔥 حساب التهديد (Threat Calculation) 🔥
                                    let threatGen = dmg;
                                    if (p.class === 'Tank') threatGen *= 3; // التانك يولد 3 أضعاف التهديد
                                    p.threat = (p.threat || 0) + threatGen;

                                    log.push(`🗡️ **${p.name}** ${isCrit ? '**CRIT!**' : ''} سبب ${dmg} ضرر.`);
                                    
                                    // 🔥 فحص مرحلة الزعيم (Boss Phase) 🔥
                                    checkBossPhase(monster, log);
                                }
                            } else if (i.customId === 'def') {
                                p.defending = true; log.push(`🛡️ **${p.name}** يدافع!`);
                                // الدفاع قد يولد تهديداً صغيراً للتانك
                                if (p.class === 'Tank') p.threat = (p.threat || 0) + 200;
                            }
                             
                            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                            checkDeaths(players, floor, log, threadChannel);
                            if (players.every(p => p.isDead)) { ongoing = false; collector.stop('all_dead'); return; }
                            if (monster.hp <= 0) { monster.hp = 0; ongoing = false; collector.stop('monster_dead'); return; }
                        }

                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
                            clearTimeout(turnTimeout); collector.stop('turn_end'); 
                        }
                    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }
                });

                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            if (monster.hp <= 0) { ongoing = false; await battleMsg.edit({ components: [] }).catch(()=>{}); }

            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                if (p.special_cooldown > 0) p.special_cooldown--; 
                
                p.effects = p.effects.filter(e => { 
                    if (e.type === 'titan') {
                        e.floors--; 
                        if (e.floors <= 0) {
                            p.maxHp = Math.floor(p.maxHp / 2);
                            if (p.hp > p.maxHp) p.hp = p.maxHp;
                            threadChannel.send(`✨ **${p.name}** عاد لحجمه الطبيعي وتلاشى مفعول العملاق.`).catch(()=>{});
                            return false;
                        }
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
                        embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                        components: generateBattleRows() 
                    });
                } catch(e) { break; }
            }

            if (monster.hp > 0 && ongoing) {
                turnCount++;
                // 🔥 تمرير 'monster' لدالة الذكاء الاصطناعي يحدث ضمنياً داخل processMonsterTurn
                ongoing = await processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel);
                if (ongoing) handleLeaderSuccession(players, log);
            }
        }

        // 🔥🔥🔥 التعامل مع الموت الجماعي باستخدام الملف الجديد 🔥🔥🔥
        if (players.every(p => p.isDead)) {
            const finalFloor = isTrapActive ? trapStartFloor : floor;
            deleteDungeonState(sql, threadChannel.id); 
            
            // 💀 حساب وتوزيع جوائز الموت (الخسارة) 💀
            await handleTeamWipe(players, floor, sql, guild.id);
            
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, finalFloor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break;
        }
         
        if (isTrapActive) isTrapActive = false;

        let baseMora = Math.floor(getBaseFloorMora(floor));
        let floorXp = Math.floor(baseMora * 0.03);  
        players.forEach(p => { if (!p.isDead) { p.loot.mora += baseMora; p.loot.xp += floorXp; } });
        totalAccumulatedCoins += baseMora;
        totalAccumulatedXP += floorXp;

        // 🔥🔥🔥 حفظ نقطة الأمان عند الطابق 20 🔥🔥🔥
        if (floor === 20) {
            snapshotLootAtFloor20(players);
            await threadChannel.send(`🛡️ **نـقـــطـــة أمـــــان!**`).catch(()=>{});
        }

        // ==========================================
        // ❖ منطقة الاستراحة (Floor Rest) ❖
        // ==========================================
        
        // 🔥🔥 التعديل هنا: منطق ظهور زر الانسحاب 🔥🔥
        let canRetreat = false;

        // 1. من 1 إلى 20: متاح دائماً
        if (floor <= 20) {
            canRetreat = true;
        } 
        // 2. الطوابق الثابتة (38, 50, 80)
        else if ([38, 50, 80].includes(floor)) {
            canRetreat = true;
        } 
        // 3. النطاقات العشوائية (30-40، 50-60، 70-80)
        else if ((floor >= 30 && floor <= 40) || (floor >= 50 && floor <= 60) || (floor >= 70 && floor <= 80)) {
            // فرصة عشوائية (مثلاً 40% فرصة ظهور في كل طابق داخل النطاق)
            if (Math.random() < 0.4) {
                canRetreat = true;
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
                 restDesc += `\n\n✨ **فرصة نادرة:** وجـدتـم بوابـة انسـحـاب!`;
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
            restMsg = await threadChannel.send({ embeds: [restEmbed], components: [restRow] });
        } catch (err) { break; }

        const warningTimeout = setTimeout(() => {
            threadChannel.send("✶ الدانجـون سيبتلـعـكم بسبب الخمـول امام القائد 10 ثواني للاستمرار").catch(()=>{});
        }, 50000); 
         
        const decision = await new Promise(res => {
            const decCollector = restMsg.createMessageComponentCollector({ time: 60000 });
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
                        // 🔥🔥🔥 انسحاب فردي باستخدام الملف الجديد 🔥🔥🔥
                        const pIndex = players.findIndex(pl => pl.id === i.user.id);
                        if (pIndex > -1) {
                            const leavingPlayer = players[pIndex];
                            leavingPlayer.retreatFloor = floor;
                            
                            // ✅ استدعاء دالة الانسحاب الفوري ✅
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
            deleteDungeonState(sql, threadChannel.id); // حذف الحفظ عند الخسارة
            
            // 💀 حساب وتوزيع جوائز الموت (الخسارة) 💀
            await handleTeamWipe(players, floor, sql, guild.id);

            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break; 
        } 
        else if (decision === 'retreat') {
            deleteDungeonState(sql, threadChannel.id); // حذف الحفظ عند انسحاب القائد
            
            // 🔥 توزيع جوائز انسحاب القائد (الآمن) 🔥
            await handleLeaderRetreat(players, sql, guild.id);

            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
            return;
        } 
        else if (decision === 'continue') {
            if (floor > 10 && floor < 90 && Math.random() < 0.01) { 
                isTrapActive = true;
                trapStartFloor = floor;
                const minTarget = floor + 2;
                const maxTarget = 95;
                const targetFloor = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
                floor = targetFloor - 1; 

                // 🔥🔥🔥 التعديل الجديد: فك الختم فوراً عند الانتقال لطوابق عالية 🔥🔥🔥
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
                // 🔥🔥🔥 نهاية التعديل 🔥🔥🔥

                const trapEmbed = new EmbedBuilder()
                    .setTitle('⚠️ انـذار: شـذوذ زمـكـانـي!')
                    .setDescription(`🌀 **لقد وقعتم في فخ الأبعاد!**\nتم قذفكم قسراً للأمام إلى الطابق **${targetFloor}**!\n\n☠️ الوحوش هنا لا ترحم... النجاة شبه مستحيلة!`)
                    .setColor(Colors.DarkRed)
                    .setThumbnail('https://media.discordapp.net/attachments/1145327691772481577/115000000000000000/blackhole.gif'); 
                await threadChannel.send({ embeds: [trapEmbed] }).catch(()=>{});
            } else {
                await threadChannel.send(`⚔️ **يتوغل الفريق بالدانجون نحو طوابق أعمق...**`).catch(()=>{});

                const canTriggerEvent = (floor - lastEventFloor) > 4;
                // 🔥🔥🔥 تم حذف setTimeout من هنا لتفادي المؤقت المزدوج 🔥🔥🔥
                if (canTriggerEvent && floor > 5 && !isTrapActive && Math.random() < 0.30) {
                    let eventToTrigger = '';
                    if (lastEventType === 'merchant') eventToTrigger = 'chest'; 
                    else if (lastEventType === 'chest') eventToTrigger = 'merchant'; 
                    else eventToTrigger = Math.random() < 0.5 ? 'merchant' : 'chest';

                    if (eventToTrigger === 'merchant') {
                        // الآن الدالة تنتظر تلقائياً بفضل الـ Promise المعدل في ملف التاجر
                        await triggerMysteryMerchant(threadChannel, players, sql, guild.id, merchantState);
                        lastEventType = 'merchant'; lastEventFloor = floor;
                    } else {
                        // كذلك الصناديق تنتظر وقتها الخاص
                        await triggerMimicChest(threadChannel, players);
                        lastEventType = 'chest'; lastEventFloor = floor;
                    }
                }
            }
        }
        players.forEach(p => { if(!p.isDead) p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.3)); });
    }

    // 🔥🔥🔥 الإضافة هنا: التحقق من الفوز بالدانجون كاملاً 🔥🔥🔥
    
    // إذا وصلوا هنا، فهذا يعني أنهم لم يموتوا جميعاً (الشرط في بداية اللوب)
    // وأن اللوب انتهت (وصلوا للطابق 100 وخلصوه)
    
    const alivePlayers = players.filter(p => !p.isDead);
    if (alivePlayers.length > 0) {
        
        // 🗑️ حذف الحفظ عند الفوز
        deleteDungeonState(sql, threadChannel.id);

        const winEmbed = new EmbedBuilder()
            .setTitle('👑 اعتـراف الإمبـراطـور: اجتيـاز الاختبـار الأعظـم 👑')
            .setDescription(`**"أحسنتـم... لم أتوقع أن تصمدوا أمامي لكل هذا الوقت."**\n\nتـمت تصفيـة الدانجـون بنجـاح، فالتسجـل امبراطوريتـنـا اسمأئكـم بين العظمـاء!`)
            .setColor(Colors.Gold)
            .setImage('https://i.postimg.cc/Hx8d7XpD/morax.jpg') 
            .setTimestamp();

        // 🔥 منشن الفائزين فقط 🔥
        const mentions = alivePlayers.map(p => `<@${p.id}>`).join(' ');
        await threadChannel.send({ content: `🎉 ${mentions}`, embeds: [winEmbed] });

        // 🔥 صرف الغنائم المتراكمة للناجين (بنفس منطق الانسحاب الآمن) 🔥
        await handleLeaderRetreat(alivePlayers, sql, guild.id);

        // توزيع الجوائز الختامية (المليون مورا)
        alivePlayers.forEach(p => {
            if (sql.open) {
                // إضافة مورا ضخمة
                sql.prepare("UPDATE levels SET mora = mora + 1000000, xp = xp + 50000 WHERE user = ? AND guild = ?").run(p.id, guild.id);
            }
        });
        
        // إرسال رسالة النهاية الرسمية
        await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, 100, "win", sql, guild.id, hostId, activeDungeonRequests);
    }

} // <--- نهاية دالة runDungeon

module.exports = { runDungeon };
