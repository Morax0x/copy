const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Colors, 
    StringSelectMenuBuilder 
} = require('discord.js');

const { dungeonConfig, EMOJI_MORA, EMOJI_XP } = require('./dungeon/constants');
const { ensureInventoryTable, getBaseFloorMora, applyDamageToPlayer, getRealPlayerData } = require('./dungeon/utils');
const { getRandomMonster } = require('./dungeon/monsters');
const { handleSkillUsage } = require('./dungeon/skills');
const { buildSkillSelector, buildPotionSelector, generateBattleEmbed, generateBattleRows } = require('./dungeon/ui');
const { triggerMimicChest } = require('./dungeon/mimic-chest');
const { triggerMysteryMerchant } = require('./dungeon/mystery-merchant');
const { checkDeaths, handleLeaderSuccession, cleanName } = require('./dungeon/core/battle-utils'); 
const { setupPlayers } = require('./dungeon/core/setup');
const { sendEndMessage } = require('./dungeon/core/end-game');
const { handleOwnerMenu } = require('./dungeon/actions/owner-menu');
const { processMonsterTurn } = require('./dungeon/logic/monster-turn');

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
        return threadChannel.send("⚠️ **خطأ تقني:** قاعدة البيانات غير متصلة حالياً.").catch(() => {});
    }
    ensureInventoryTable(sql); 

    let retreatedPlayers = []; 
    let isTrapActive = false;
    let trapStartFloor = 0;
    let lastEventFloor = -10; 
    let lastEventType = null; 
    let merchantState = { skipFloors: 0, weaknessActive: false, isGateJump: false };
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
        players = await setupPlayers(guild, partyIDs, partyClasses, sql, "1145327691772481577"); 
    }

    if (players.length === 0) {
        if (!resumeData) activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ: لم يتم العثور على اللاعبين.").catch(() => {});
    }

    if (!resumeData) {
        players.forEach(p => {
            if (p.isSealed) {
                 threadChannel.send(`✶ <@${p.id}> تـم ختـم قوتك الى الطابـق 18...`).catch(() => {});
            }
        });
    }

    const maxFloors = 100; 

    // 🔥 بداية الحلقة 🔥
    for (let floor = startFloor; floor <= maxFloors; floor++) {
        
        // 💾 1. حفظ التقدم 💾
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

        if (players.length === 0 || players.every(p => p.isDead)) {
            deleteDungeonState(sql, threadChannel.id); 
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
                await threadChannel.send(`⏩ **انتقال سريع!** شق الامبراطـور الزمكان ${oldFloor} إلى ${floor}.`);
            } catch (err) { break; }
            
            currentState.floor = floor;
            saveDungeonState(sql, threadChannel.id, guild.id, hostId, currentState); 
            continue; 
        }

        // --- أحداث فك الختم ---
        if (floor === 15 || floor === 19) {
            players.forEach(p => {
                if (p.isSealed && !p.isDead) {
                    if (floor === 15) { p.sealMultiplier = 0.5; threadChannel.send(`✶ <@${p.id}> كسرت الختم جزئياً...`).catch(()=>{}); }
                    if (floor === 19) { p.isSealed = false; p.sealMultiplier = 1.0; threadChannel.send(`✶ <@${p.id}> تحطم الختم بالكامل!`).catch(()=>{}); }
                }
            });
        }

        // تجهيز اللاعبين
        for (let p of players) {
            if (!p.isDead) { 
                if (p.shieldPersistent) p.shield = (p.shield || 0) + (p.startingShield || 0);
                else p.shield = p.startingShield || 0;
                
                p.startingShield = 0;
                p.effects = p.effects.filter(e => ['poison', 'atk_buff', 'weakness', 'titan'].includes(e.type));
                p.defending = false; 
                p.summon = null; 
            } 
        }

        const floorConfig = dungeonConfig.floors.find(f => f.floor === floor) || { type: 'minion' };
        const randomMob = getRandomMonster(floorConfig.type, theme, floor);

        let finalHp, finalAtk;
        if (floor <= 10) {
            const baseFloorHP = 300 + ((floor - 1) * 100);
            const baseAtk = 15 + (floor * 3);
            finalHp = Math.floor(baseFloorHP * (floorConfig.hp_mult || 1));
            finalAtk = Math.floor(baseAtk * (floorConfig.atk_mult || 1));
        } else {
            const tier = floor - 10;
            const baseFloorHP = 1200 + (Math.pow(tier, 2) * 50); 
            const baseAtk = 45 + (tier * 5); 
            finalHp = Math.floor(baseFloorHP * (floorConfig.hp_mult || 1));
            finalAtk = Math.floor(baseAtk * (floorConfig.atk_mult || 1));
        }

        // تحديد قوة موراكس
        if (floor === 100) {
            finalHp = 1000000; 
            finalAtk = 15000;  
        }

        let monster = {
            name: floor === 100 ? randomMob.name : `${randomMob.name} (Lv.${floor})`, 
            hp: finalHp, maxHp: finalHp, atk: finalAtk, 
            enraged: false, effects: [], targetFocusId: null, frozen: false 
        };

        if (merchantState.weaknessActive) {
            monster.effects.push({ type: 'weakness', val: 0.50, turns: 99 });
            merchantState.weaknessActive = false;
        }

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.maxHp.toLocaleString()} | DMG: ${monster.atk})`];
        if (monster.effects.some(e => e.type === 'weakness')) log.push(`👁️ **تم كشف نقطة ضعف الوحش!**`);

        let ongoing = true;
        let turnCount = 0;

        let battleMsg;
        try {
            battleMsg = await threadChannel.send({ 
                embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                components: generateBattleRows() 
            });
        } catch (err) {
            console.log("Thread deleted, stopping.");
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
                                log.push(`☠️ **${afkP.name}** مات بسبب الخمول!`);
                            } else {
                                monster.targetFocusId = afkP.id; actedPlayers.push(afkP.id); 
                                await threadChannel.send(`<:downward:1435880484046372914> <@${afkP.id}> تجاوزناك لعدم الاستجابة!`).catch(()=>{});
                            }
                        }
                        handleLeaderSuccession(players, log);
                        if (players.every(p => p.isDead)) { ongoing = false; collector.stop('all_dead'); return; }
                        collector.stop('turn_end'); 
                    } else {
                        collector.stop('turn_end');
                    }
                }, 45000); 

                collector.on('collect', async i => {
                    if (i.customId === 'def' && i.user.id === "1145327691772481577") { // OWNER_ID
                         await handleOwnerMenu(i, players, monster, log, threadChannel, sql, guild, hostId, activeDungeonRequests, merchantState, battleMsg, turnTimeout, collector, ongoingRef);
                         if (!ongoingRef.value) ongoing = false;
                         return;
                    }

                    if (i.user.id === "1145327691772481577" && !players.find(p => p.id === "1145327691772481577")) {
                        const member = await i.guild.members.fetch("1145327691772481577").catch(() => null);
                        if (member) {
                             const ownerPlayer = getRealPlayerData(member, sql, '???'); 
                             ownerPlayer.name = cleanName(ownerPlayer.name);
                             players.push(ownerPlayer);
                             log.push(`👑 **الأمبراطـور اقتحـم المعركـة!**`);
                        }
                    }
                      
                    if (!i.replied && !i.deferred && !i.isStringSelectMenu() && !i.isModalSubmit()) await i.deferUpdate().catch(()=>{});
                    if (processingUsers.has(i.user.id)) return;
                    let p = players.find(pl => pl.id === i.user.id);
                    if (!p || p.isDead || actedPlayers.includes(p.id)) return;

                    processingUsers.add(i.user.id);

                    try {
                        if (i.customId === 'skill') {
                            const skillRow = buildSkillSelector(p);
                            if (!skillRow) {
                                await i.followUp({ content: "❌ لا توجد مهارات.", flags: 64 });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const skillMsg = await i.followUp({ content: "✨ **اختر المهارة:**", components: [skillRow], flags: 64 });
                                const selection = await skillMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 10000 });
                                await selection.deferUpdate().catch(()=>{});
                                const skillId = selection.values[0];
                                
                                const shieldSkills = ['skill_shielding', 'race_human_skill'];
                                if (shieldSkills.includes(skillId) && p.shield > 0) {
                                    await selection.followUp({ content: `🛡️ **لديك درع نشط بالفعل!**`, flags: 64 });
                                    processingUsers.delete(i.user.id); return; 
                                }

                                let skillNameUsed = "مهارة";
                                let skillObj = { id: skillId, name: 'Skill', effectValue: 0 };
                                if (!skillId.startsWith('class_') && p.skills[skillId]) skillObj = p.skills[skillId];
                                
                                let originalAtk = p.atk;
                                if (p.isSealed) p.atk = Math.floor(p.atk * p.sealMultiplier);

                                const res = handleSkillUsage(p, { ...skillObj, id: skillId }, monster, log, threadChannel, players);
                                p.atk = originalAtk;

                                if (res && res.error) {
                                    await selection.editReply({ content: res.error, components: [] }).catch(()=>{});
                                    processingUsers.delete(i.user.id); return;
                                }
                                
                                skillNameUsed = res.name || skillObj.name;
                                actedPlayers.push(p.id); p.skipCount = 0;
                                await selection.editReply({ content: `✅ تم: ${skillNameUsed}`, components: [] }).catch(()=>{});
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});
                                
                                checkDeaths(players, floor, log, threadChannel);
                                if (monster.hp <= 0) { monster.hp = 0; ongoing = false; collector.stop('monster_dead'); return; }

                            } catch (err) { processingUsers.delete(i.user.id); return; }
                        } else if (i.customId === 'heal') {
                            const potionRow = buildPotionSelector(p, sql, guild.id);
                            if (!potionRow) {
                                await i.followUp({ content: "❌ لا تملك جرعات!", flags: 64 });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const potionMsg = await i.followUp({ content: "🧪 **اختر الجرعة:**", components: [potionRow], flags: 64 });
                                const selection = await potionMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 15000 });
                                await selection.deferUpdate().catch(()=>{});
                                const potionId = selection.values[0].replace('use_potion_', '');
                                
                                if (potionId === 'potion_titan') {
                                    p.titanPotionUses = p.titanPotionUses || 0;
                                    if (p.titanPotionUses >= 3) {
                                        await selection.followUp({ content: "🚫 **الحد الأقصى 3!**", flags: 64 });
                                        processingUsers.delete(i.user.id); return;
                                    }
                                    p.titanPotionUses++; 
                                }
                                
                                if (sql.open) sql.prepare("UPDATE user_inventory SET quantity = quantity - 1 WHERE userID = ? AND guildID = ? AND itemID = ?").run(p.id, guild.id, potionId);

                                let actionMsg = "";
                                if (potionId === 'potion_heal') { p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5)); actionMsg = "🧪 شفاء 50%!"; }
                                else if (potionId === 'potion_reflect') { p.effects.push({ type: 'reflect', val: 0.5, turns: 2 }); actionMsg = "🌵 درع عاكس!"; }
                                else if (potionId === 'potion_time') { p.special_cooldown = 0; p.skillCooldowns = {}; actionMsg = "⏳ إعادة شحن!"; }
                                else if (potionId === 'potion_titan') { p.maxHp *= 2; p.hp = p.maxHp; p.effects.push({ type: 'titan', floors: 5 }); monster.targetFocusId = p.id; actionMsg = `🔥 عملاق! (${p.titanPotionUses}/3)`; }
                                else if (potionId === 'potion_sacrifice') {
                                    p.hp = 0; p.isDead = true; p.isPermDead = true; p.deathFloor = floor; 
                                    players.forEach(ally => { if (ally.id !== p.id) { ally.isDead = false; ally.isPermDead = false; ally.reviveCount = 0; ally.hp = ally.maxHp; ally.effects = []; } });
                                    actionMsg = "💀 تضحية!";
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
                        } else if (i.customId === 'atk' || i.customId === 'def') {
                            actedPlayers.push(p.id); p.skipCount = 0; 
                            if (i.customId === 'atk') {
                                let canAttack = true;
                                if (p.effects.some(e => e.type === 'confusion' && Math.random() < e.val)) {
                                    canAttack = false; applyDamageToPlayer(p, Math.floor(p.maxHp * 0.15));
                                    log.push(`😵 **${p.name}** ضرب نفسه!`);
                                } 
                                else if (p.effects.some(e => e.type === 'blind' && Math.random() < e.val)) {
                                    canAttack = false; log.push(`☁️ **${p.name}** أخطأ الهدف!`);
                                }

                                if (canAttack) {
                                    let atkMultiplier = 1.0;
                                    p.effects.forEach(e => { if(e.type === 'atk_buff') atkMultiplier += e.val; });
                                    let currentAtk = Math.floor(p.atk * atkMultiplier);
                                    if (p.isSealed) currentAtk = Math.floor(currentAtk * p.sealMultiplier); 

                                    const isCrit = Math.random() < (p.critRate || 0.2);
                                    let dmg = Math.floor(currentAtk * (0.9 + Math.random() * 0.2));
                                    if (isCrit) dmg = Math.floor(dmg * 1.5);

                                    monster.hp -= dmg; p.totalDamage += dmg; 
                                    log.push(`🗡️ **${p.name}** ${isCrit ? '**CRIT!**' : ''} سبب ${dmg} ضرر.`);
                                }
                            } else if (i.customId === 'def') {
                                p.defending = true; log.push(`🛡️ **${p.name}** يدافع!`);
                            }
                             
                            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});
                            checkDeaths(players, floor, log, threadChannel);
                            if (players.every(p => p.isDead)) { ongoing = false; collector.stop('all_dead'); return; }
                            if (monster.hp <= 0) { monster.hp = 0; ongoing = false; collector.stop('monster_dead'); return; }
                        }

                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
                            clearTimeout(turnTimeout); collector.stop('turn_end'); 
                        }
                    } catch (e) { console.error(e); } finally { processingUsers.delete(i.user.id); }
                });

                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            if (monster.hp <= 0) { ongoing = false; await battleMsg.edit({ components: [] }).catch(()=>{}); }

            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                if (p.special_cooldown > 0) p.special_cooldown--; 
                p.effects = p.effects.filter(e => { if (e.type === 'titan') return true; e.turns--; return e.turns > 0; });
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
                ongoing = await processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel);
                if (ongoing) handleLeaderSuccession(players, log);
            }
        } 

        if (players.every(p => p.isDead)) {
            const finalFloor = isTrapActive ? trapStartFloor : floor;
            deleteDungeonState(sql, threadChannel.id); 
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, finalFloor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break;
        }
         
        if (isTrapActive) isTrapActive = false;

        let baseMora = Math.floor(getBaseFloorMora(floor));
        let floorXp = Math.floor(baseMora * 0.03);  
        players.forEach(p => { if (!p.isDead) { p.loot.mora += baseMora; p.loot.xp += floorXp; } });
        totalAccumulatedCoins += baseMora;
        totalAccumulatedXP += floorXp;

        players.forEach(p => {
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
                return true;
            });
        });

        // --- منطقة الاستراحة ---
        let canRetreat = (floor <= 20) || ([38, 50, 80].includes(floor));
        if (!canRetreat && ((floor >= 30 && floor <= 40) || (floor >= 50 && floor <= 60) || (floor >= 70 && floor <= 80))) {
             if (Math.random() < 0.4) canRetreat = true;
        }

        let restDesc = `✶ نجحتـم في تصفية الطابق الـ: **${floor}**\n✶ تم استعادة صحة المغامرين بنسبة **%30**\n\n**✶ الغنـائـم المتراكمة:**\n✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}\n✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}`;
        const restRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success));
        
        if (floor > 20) restDesc += canRetreat ? `\n\n✨ **فرصة نادرة:** عثـرتـم عـلى بوابـة انسحـاب!` : `\n\n✥ **تحذيـر:** المنطقة خطرة - الانسحاب غير متاح!`;
        else restDesc += `\n\n- القرار بيد **القائد** للاستمرار أو الانسحاب!`;

        if (canRetreat) restRow.addComponents(new ButtonBuilder().setCustomId('retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger));

        if (floor === 99) {
            restDesc += `\n\n⚠️💀 **تحذيـــر نهائـــي** 💀⚠️\nأنتم على أعتاب العرش... **الإمبراطور موراكس** بانتظاركم في الطابق القادم! لا تراجع بعد الآن!`;
        }

        const restEmbed = new EmbedBuilder().setTitle('❖ استـراحـة بيـن الطـوابـق').setDescription(restDesc).setColor(Colors.Red).setImage('https://i.postimg.cc/KcJ6gtzV/22.jpg');
        
        let restMsg;
        try { restMsg = await threadChannel.send({ embeds: [restEmbed], components: [restRow] }); } catch (err) { break; }

        const warningTimeout = setTimeout(() => { threadChannel.send("✶ الدانجـون سيبتلـعـكم بسبب الخمـول امام القائد 10 ثواني للاستمرار").catch(()=>{}); }, 50000); 
         
        const decision = await new Promise(res => {
            const decCollector = restMsg.createMessageComponentCollector({ time: 60000 });
            decCollector.on('collect', async i => {
                clearTimeout(warningTimeout); 
                let p = players.find(pl => pl.id === i.user.id);
                
                if (i.customId === 'continue') {
                    if (!p || p.class !== 'Leader') return i.reply({ content: "🚫 **فقط القائد!**", flags: 64 });
                    await i.deferUpdate(); return decCollector.stop('continue');
                }
                if (i.customId === 'retreat' && canRetreat) {
                    if (p && p.class === 'Leader') { await i.deferUpdate(); return decCollector.stop('retreat'); }
                    else {
                        const pIndex = players.findIndex(pl => pl.id === i.user.id);
                        if (pIndex > -1) {
                            const leavingPlayer = players[pIndex];
                            leavingPlayer.retreatFloor = floor;
                            
                            // 🔥🔥🔥 تعديل: إعطاء المكافأة فوراً للعضو المنسحب 🔥🔥🔥
                            const earnedMora = leavingPlayer.loot.mora || 0;
                            const earnedXp = leavingPlayer.loot.xp || 0;
                            
                            if (sql.open && (earnedMora > 0 || earnedXp > 0)) {
                                sql.prepare("UPDATE levels SET mora = mora + ?, xp = xp + ? WHERE user = ? AND guild = ?")
                                   .run(earnedMora, earnedXp, leavingPlayer.id, guild.id);
                            }
                            
                            // تصفير اللوت حتى لا يأخذه مرة أخرى إذا تم احتسابه لاحقاً بالخطأ
                            leavingPlayer.loot.mora = 0;
                            leavingPlayer.loot.xp = 0;

                            retreatedPlayers.push(leavingPlayer);
                            players.splice(pIndex, 1); 
                            
                            await i.reply({ content: `👋 **انسحبت!** وحصلت على: **${earnedMora}** مورا و **${earnedXp}** XP.`, flags: 64 });
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
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", sql, guild.id, hostId, activeDungeonRequests); break; 
        } 
        else if (decision === 'retreat') {
            deleteDungeonState(sql, threadChannel.id);
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "retreat", sql, guild.id, hostId, activeDungeonRequests); return;
        } 
        else if (decision === 'continue') {
            if (floor > 10 && floor < 90 && Math.random() < 0.01) { 
                isTrapActive = true;
                trapStartFloor = floor;
                const minTarget = floor + 2;
                const maxTarget = 95;
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
                    .setDescription(`🌀 **لقد وقعتم في فخ الأبعاد!**\nتم قذفكم قسراً للأمام إلى الطابق **${targetFloor}**!\n\n☠️ الوحوش هنا لا ترحم... النجاة شبه مستحيلة!`)
                    .setColor(Colors.DarkRed)
                    .setThumbnail('https://media.discordapp.net/attachments/1145327691772481577/115000000000000000/blackhole.gif'); 
                await threadChannel.send({ embeds: [trapEmbed] }).catch(()=>{});
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
        players.forEach(p => { if(!p.isDead) p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.3)); });
    } 

    const alivePlayers = players.filter(p => !p.isDead);
    if (alivePlayers.length > 0) {
        
        deleteDungeonState(sql, threadChannel.id);

        const winEmbed = new EmbedBuilder()
            .setTitle('👑 اعتـراف الإمبـراطـور: اجتيـاز الاختبـار الأعظـم 👑')
            .setDescription(`**"أحسنتـم... لم أتوقع أن تصمدوا أمامي لكل هذا الوقت."**\n\nتـمت تصفيـة الدانجـون بنجـاح، فالتسجـل امبراطوريتـنـا اسمأئكـم بين العظمـاء!`)
            .setColor(Colors.Gold)
            .setImage('https://i.postimg.cc/Hx8d7XpD/morax.jpg') 
            .setTimestamp();

        const mentions = alivePlayers.map(p => `<@${p.id}>`).join(' ');
        await threadChannel.send({ content: `🎉 ${mentions}`, embeds: [winEmbed] });

        alivePlayers.forEach(p => {
            if (sql.open) {
                sql.prepare("UPDATE levels SET mora = mora + 1000000, xp = xp + 50000 WHERE user = ? AND guild = ?").run(p.id, guild.id);
            }
        });
        
        await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, 100, "win", sql, guild.id, hostId, activeDungeonRequests);
    }

} 

module.exports = { runDungeon };
