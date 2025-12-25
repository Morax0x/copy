const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');
const { 
    dungeonConfig, 
    EMOJI_MORA, 
    EMOJI_XP, 
    EMOJI_BUFF, 
    EMOJI_NERF, 
    OWNER_ID, 
    WIN_IMAGES, 
    LOSE_IMAGES 
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

// --- Main Dungeon Execution Logic ---

async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId, partyClasses, activeDungeonRequests) {
    const guild = threadChannel.guild;
    ensureInventoryTable(sql); 

    let players = [];
    let retreatedPlayers = [];
    
    // --- متغيرات نظام الفخ ---
    let isTrapActive = false;
    let trapStartFloor = 0;
    // -----------------------

    const promises = partyIDs.map(id => guild.members.fetch(id).catch(() => null));
    const members = await Promise.all(promises);

    members.forEach((m, index) => {
        if (m) {
            const cls = partyClasses.get(m.id) || 'Adventurer';
            players.push(getRealPlayerData(m, sql, cls));
        }
    });

    if (players.length === 0) {
        activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ: لم يتم العثور على اللاعبين.");
    }

    const maxFloors = 100; 
    let totalAccumulatedCoins = 0;
    let totalAccumulatedXP = 0;

    for (let floor = 1; floor <= maxFloors; floor++) {
        if (players.every(p => p.isDead)) break; 

        for (let p of players) {
            if (!p.isDead) { 
                p.shield = 0; p.effects = []; p.defending = false; p.summon = null; 
            } 
        }

        const floorConfig = dungeonConfig.floors.find(f => f.floor === floor) || dungeonConfig.floors[dungeonConfig.floors.length - 1];
        const randomMob = getRandomMonster(floorConfig.type, theme);

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

        let monster = {
            name: `${randomMob.name} (Lv.${floor})`, 
            hp: finalHp, maxHp: finalHp, atk: finalAtk, 
            enraged: false, effects: [], targetFocusId: null, frozen: false 
        };

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.maxHp.toLocaleString()} | DMG: ${monster.atk})`];
        let ongoing = true;
        let turnCount = 0;

        let battleMsg = await threadChannel.send({ 
            embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
            components: generateBattleRows() 
        });

        while (ongoing) {
            const collector = battleMsg.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });
            let actedPlayers = [];
            let processingUsers = new Set(); 

            await new Promise(resolve => {
                const turnTimeout = setTimeout(() => { 
                    const afkPlayers = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                    if (afkPlayers.length > 0) {
                          afkPlayers.forEach(afkP => {
                                afkP.skipCount = (afkP.skipCount || 0) + 1;
                                monster.targetFocusId = afkP.id;
                                threadChannel.send(`⚠️ **${afkP.name}** <@${afkP.id}> تم تخطي دورك بسبب عدم الاستجابة!`).catch(()=>{});
                          });
                    }
                    collector.stop('turn_end'); 
                }, 45000); 

                collector.on('collect', async i => {
                    if (!i.replied && !i.deferred) await i.deferUpdate().catch(()=>{});
                    
                    if (processingUsers.has(i.user.id)) return i.followUp({ content: "🚫 اهدأ! طلبك قيد المعالجة.", ephemeral: true }).catch(()=>{});
                    
                    if (i.user.id === OWNER_ID && !players.find(p => p.id === OWNER_ID)) {
                        let ownerPlayer = players.find(pl => pl.id === OWNER_ID);
                        if (!ownerPlayer) {
                             const member = await i.guild.members.fetch(OWNER_ID).catch(() => null);
                             if (member) {
                                 ownerPlayer = getRealPlayerData(member, sql, '???'); 
                                 players.push(ownerPlayer);
                                 log.push(`👑 **اقتـحـام الأونـر!**`);
                             }
                        }
                    }

                    let p = players.find(pl => pl.id === i.user.id);
                    if (!p) return i.followUp({ content: "🚫 لست مشاركاً!", ephemeral: true });
                    if (p.isDead || actedPlayers.includes(p.id)) return;
                    
                    processingUsers.add(i.user.id);

                    try {
                        if (i.customId === 'skill') {
                            const skillRow = buildSkillSelector(p);
                            if (!skillRow) {
                                await i.followUp({ content: "❌ لا توجد مهارات.", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const skillMsg = await i.followUp({ content: "✨ **اختر المهارة:**", components: [skillRow], ephemeral: true, fetchReply: true });
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
                                
                                const { skillsConfig } = require('./dungeon/constants'); 
                                
                                if (!skillId.startsWith('class_') && skillId !== 'class_special_skill' && skillId !== 'skill_secret_owner' && skillId !== 'skill_owner_leave') {
                                     if (p.skills[skillId]) skillObj = p.skills[skillId];
                                     else if (p.id === OWNER_ID) {
                                         const sConf = skillsConfig.find(s=>s.id === skillId);
                                         if(sConf) skillObj = { ...sConf, effectValue: sConf.base_value * 2 };
                                     }
                                }

                                const res = handleSkillUsage(p, { ...skillObj, id: skillId }, monster, log, threadChannel, players);
                                
                                if (res && res.error) {
                                    await selection.editReply({ content: res.error, components: [] }).catch(()=>{});
                                    processingUsers.delete(i.user.id); return;
                                }
                                
                                if (res && res.type === 'owner_leave') {
                                     players = players.filter(pl => pl.id !== OWNER_ID);
                                     if (players.length === 0) { collector.stop('monster_dead'); return; }
                                }
                                
                                if (res && res.name) skillNameUsed = res.name;
                                else if (skillObj.name !== 'Skill') skillNameUsed = skillObj.name;

                                actedPlayers.push(p.id); 
                                p.skipCount = 0; 
                                await selection.editReply({ content: `✅ تم استخدام: ${skillNameUsed}`, components: [] }).catch(()=>{});
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                            } catch (err) { 
                                processingUsers.delete(i.user.id); return; 
                            }
                        } 
                        else if (i.customId === 'heal') {
                            const potionRow = buildPotionSelector(p, sql, guild.id);
                            if (!potionRow) {
                                await i.followUp({ content: "❌ لا تملك جرعات في حقيبتك!", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const potionMsg = await i.followUp({ content: "🧪 **اختر الجرعة:**", components: [potionRow], ephemeral: true, fetchReply: true });
                                const selection = await potionMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 15000 });
                                await selection.deferUpdate().catch(()=>{});
                                const potionId = selection.values[0].replace('use_potion_', '');
                                sql.prepare("UPDATE user_inventory SET quantity = quantity - 1 WHERE userID = ? AND guildID = ? AND itemID = ?").run(p.id, guild.id, potionId);

                                let actionMsg = "";
                                if (potionId === 'potion_heal') {
                                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                                    actionMsg = "🧪 استعاد 50% HP!";
                                } else if (potionId === 'potion_reflect') {
                                    p.effects.push({ type: 'reflect', val: 0.5, turns: 2 });
                                    actionMsg = "🌵 جهز درع الأشواك!";
                                } else if (potionId === 'potion_time') {
                                    p.special_cooldown = 0;
                                    p.skillCooldowns = {};
                                    actionMsg = "⏳ شرب جرعة الزمن وأعاد شحن مهاراته!";
                                } else if (potionId === 'potion_titan') {
                                    p.maxHp *= 2; p.hp = p.maxHp;
                                    p.effects.push({ type: 'titan', turns: 3 }); 
                                    monster.targetFocusId = p.id;
                                    actionMsg = "🔥 تحول لعملاق!";
                                } else if (potionId === 'potion_sacrifice') {
                                    p.hp = 0; p.isDead = true; p.isPermDead = true;
                                    players.forEach(ally => {
                                        if (ally.id !== p.id) {
                                            ally.isDead = false;
                                            ally.isPermDead = false;
                                            ally.reviveCount = 0;
                                            ally.hp = ally.maxHp; 
                                            ally.effects = [];
                                        }
                                    });
                                    actionMsg = "💀 شرب جرعة التضحية، تحللت جثته وأنقذ الجميع!";
                                    threadChannel.send(`💀 **${p.name}** شرب جرعة التضحية، تحللت جثته وأنقذ الفريق!`).catch(()=>{});
                                }
                                log.push(`**${p.name}**: ${actionMsg}`);
                                actedPlayers.push(p.id); p.skipCount = 0;
                                await selection.editReply({ content: `✅ ${actionMsg}`, components: [] }).catch(()=>{});
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

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
                                    const currentAtk = Math.floor(p.atk * atkMultiplier);
                                    
                                    const baseCrit = p.critRate || 0.2;
                                    const isCrit = Math.random() < baseCrit;
                                    
                                    let dmg = Math.floor(currentAtk * (0.9 + Math.random() * 0.2));
                                    if (isCrit) dmg = Math.floor(dmg * 1.5);
                                    monster.hp -= dmg; p.totalDamage += dmg; 
                                    log.push(`🗡️ **${p.name}** ${isCrit ? '**CRIT!**' : ''} سبب ${dmg} ضرر.`);
                                }
                            } else if (i.customId === 'def') {
                                p.defending = true; log.push(`🛡️ **${p.name}** يدافع!`);
                            }
                            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});
                        }

                        if (monster.hp <= 0) {
                            monster.hp = 0; ongoing = false; collector.stop('monster_dead'); return; 
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
                p.effects = p.effects.filter(e => { e.turns--; return e.turns > 0; });
            });

            if (turnCount % 3 === 0 && ongoing) {
                await battleMsg.delete().catch(()=>{});
                battleMsg = await threadChannel.send({ 
                    embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                    components: generateBattleRows() 
                });
            }

            if (monster.hp > 0 && ongoing) {
                turnCount++;
                if (monster.frozen) { log.push(`❄️ **${monster.name}** متجمد!`); monster.frozen = false; } 
                else {
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

                    if (monster.hp <= 0) { ongoing = false; break; }

                    const confusion = monster.effects.find(e => e.type === 'confusion');
                    if (confusion && Math.random() < confusion.val) {
                        const selfDmg = Math.floor(monster.atk * 0.5);
                        monster.hp -= selfDmg;
                        log.push(`😵 **${monster.name}** في حالة ارتباك وضرب نفسه! (-${selfDmg} HP)`);
                    } else {
                        // AI Logic
                        const alive = players.filter(p => !p.isDead);
                        let skillUsed = false;

                        if (floor > 17 && alive.length > 0) {
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

                        if (!skillUsed && floor > 17 && alive.length > 0) {
                            if (Math.random() < 0.20) {
                                const randomGenericSkill = GENERIC_MONSTER_SKILLS[Math.floor(Math.random() * GENERIC_MONSTER_SKILLS.length)];
                                randomGenericSkill.execute(monster, players, log);
                                skillUsed = true;
                            }
                        }

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

                            if (monster.hp <= 0) { ongoing = false; break; }

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
                                
                                if(target.hp <= 0 && !target.isDead) { 
                                    target.hp = 0; 
                                    target.isDead = true; 
                                    
                                    if (target.class === 'Priest' && !target.isPermDead) {
                                        players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                                        log.push(`⚰️ **سقـط الكـاهـن** - قـام بعلاج الفريق على الرمق الاخـير!`);
                                        threadChannel.send(`✨⚰️ **${target.name}** سقـط ولكنه عالج الفريق قبل موته!`).catch(()=>{});
                                    }

                                    if (target.reviveCount >= 1) {
                                        target.isPermDead = true;
                                        log.push(`💀 **${target.name}** سقط وتحللت جثته!`);
                                        threadChannel.send(`💀 **${target.name}** سقط وتحللت جثته (لا يمكن إحياؤه)!`).catch(()=>{});
                                    } else {
                                        log.push(`💀 **${target.name}** سقط!`);
                                        threadChannel.send(`💀 **${target.name}** سقط في أرض المعركة!`).catch(()=>{});
                                    }
                                }
                            }
                        }
                    }
                }
                if (players.every(p => p.isDead)) ongoing = false;
                else {
                    if (log.length > 5) log = log.slice(-5);
                    await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
                }
            }
        }

        // 🔥🔥 التحقق من حالة الخسارة والمكافآت (تعديل جوهري) 🔥🔥
        if (players.every(p => p.isDead)) {
            // إذا ماتوا والفخ نشط، نستخدم طابق ما قبل الفخ
            const finalFloor = isTrapActive ? trapStartFloor : floor;
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, finalFloor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break;
        }
        
        // 🔥🔥 إذا وصلنا هنا، يعني أنهم فازوا 🔥🔥
        // إلغاء الفخ ليتمكنوا من إكمال التقدم بشكل طبيعي وحساب الجوائز للطوابق الجديدة
        if (isTrapActive) {
            isTrapActive = false;
            // يمكن إضافة رسالة صغيرة هنا لو أردت، لكن سنكتفي بإكمال اللعب
        }

        let baseMora = Math.floor(getBaseFloorMora(floor));
        let floorXp = Math.floor(baseMora / 3); 
        players.forEach(p => { if (!p.isDead) { p.loot.mora += baseMora; p.loot.xp += floorXp; } });
        totalAccumulatedCoins += baseMora;
        totalAccumulatedXP += floorXp;

        const restEmbed = new EmbedBuilder()
            .setTitle('❖ استـراحـة بيـن الطـوابـق')
            .setDescription(`✶ نجحتـم في تصفية الطابق الـ: **${floor}**\n✶ تم استعادة صحة المغامرين بنسبة **%30**\n\n**✶ الغنـائـم المتراكمة:**\n✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}\n✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}\n\n- القرار بيد **القائد** للاستمرار أو الانسحاب!`)
            .setColor(Colors.Red)
            .setImage('https://i.postimg.cc/KcJ6gtzV/22.jpg');

        const restRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger)
        );

        const restMsg = await threadChannel.send({ embeds: [restEmbed], components: [restRow] });
        
        const decision = await new Promise(res => {
            const decCollector = restMsg.createMessageComponentCollector({ time: 60000 });
            decCollector.on('collect', async i => {
                if (i.user.id !== hostId) return i.reply({ content: "فقط القائد يقرر.", ephemeral: true });
                await i.deferUpdate(); 
                decCollector.stop(i.customId);
            });
            decCollector.on('end', (c, reason) => res(reason));
        });

        await restMsg.edit({ components: [] }).catch(()=>{});

        if (decision === 'retreat' || decision === 'time') { 
            // إذا انسحبوا والفخ كان نشطاً (في حال عدلت المنطق مستقبلاً) أو انسحبوا بشكل طبيعي
            // هنا isTrapActive سيكون false لأننا صفرناه بعد الفوز مباشرة في الأعلى
            // لذا سيأخذون جوائز الطابق المتقدم الذي وصلوا إليه (وهذا منصف لأنهم فازوا فيه)
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
            return;
        } else if (decision === 'continue') {
            
            // 🔥🔥 TRAP EVENT LOGIC 🔥🔥
            if (floor > 10 && Math.random() < 0.01) { // نسبة 1%
                isTrapActive = true;
                trapStartFloor = floor;
                
                // الانتقال لطابق عشوائي بين 31 و 90
                // ننقص 1 لأن حلقة الـ for ستزيد الطابق بمقدار 1 في نهاية الدورة
                const targetFloor = Math.floor(Math.random() * (90 - 31 + 1)) + 31;
                floor = targetFloor - 1; 

                const trapEmbed = new EmbedBuilder()
                    .setTitle('⚠️ انـذار: شـذوذ زمـكـانـي!')
                    .setDescription(`🌀 **لقد وقعتم في فخ الأبعاد!**\nتم نقلكم قسراً إلى الطابق **${targetFloor}**!\n\n☠️ الوحوش هنا لا ترحم... النجاة شبه مستحيلة!`)
                    .setColor(Colors.DarkRed)
                    .setThumbnail('https://media.discordapp.net/attachments/1145327691772481577/115000000000000000/blackhole.gif'); // صورة تخيلية أو يمكنك استخدام أي رابط

                await threadChannel.send({ content: `||@everyone||`, embeds: [trapEmbed] });
            } else {
                await threadChannel.send(`**⚔️ قـرر القائد الاستمرار! يتوغل الفريق بالدانجون نحو طوابق أعمق...**`);
            }
        }

        players.forEach(p => { if(!p.isDead) p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.3)); });
    }
}

async function sendEndMessage(mainChannel, thread, activePlayers, retreatedPlayers, floor, status, sql, guildId, hostId, activeDungeonRequests) {
    if (!sql.open) return;
    let title = "", color = "", randomImage = null;

    if (status === 'win') { title = "❖ أسطـورة الدانـجون !"; color = "#00FF00"; randomImage = getRandomImage(WIN_IMAGES); } 
    else if (status === 'retreat') { title = "❖ انـسـحـاب تـكـتيـكـي !"; color = "#FFFF00"; randomImage = getRandomImage(WIN_IMAGES); } 
    else { title = "❖ هزيمـة ساحقـة ..."; color = "#FF0000"; randomImage = getRandomImage(LOSE_IMAGES); }

    const allParticipants = [...activePlayers, ...retreatedPlayers];
      
    let mvpPlayer = allParticipants.length > 0 ? allParticipants.reduce((p, c) => (p.totalDamage > c.totalDamage) ? p : c) : null;
      
    let lootString = "";
    allParticipants.forEach(p => {
        let finalMora = Math.floor(p.loot.mora);
        let finalXp = Math.floor(p.loot.xp);
        if (p.isDead) { finalMora = Math.floor(finalMora * 0.5); finalXp = Math.floor(finalXp * 0.5); }
        sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(finalXp, finalMora, p.id, guildId);
        lootString += `✬ <@${p.id}>: ${finalMora} ${EMOJI_MORA} | ${finalXp} XP\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`**الطابق:** ${floor}\n\n**✶ تقـريـر المعـركـة:**\nنجم المعركة: ${mvpPlayer ? `<@${mvpPlayer.id}>` : 'N/A'}\n\n${lootString}`)
        .setColor(color).setImage(randomImage).setTimestamp();

    await mainChannel.send({ content: activePlayers.map(p => `<@${p.id}>`).join(' '), embeds: [embed] });
    activeDungeonRequests.delete(hostId);
      
    if (floor >= 10) {
        if (status === 'lose') {
            const debuffDuration = 15 * 60 * 1000;
            const expiresAt = Date.now() + debuffDuration;
              
            allParticipants.forEach(p => {
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'mora', -0.15);
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'xp', -0.15);
            });
            await mainChannel.send(`**💀 لعنـة الهزيمـة:** أصابت اللعنة جميع المشاركين! (-15% مورا واكس بي لـ 15د) ${EMOJI_NERF}`).catch(()=>{});

        } else if (mvpPlayer) {
            const buffDuration = 15 * 60 * 1000; 
            const expiresAt = Date.now() + buffDuration;
              
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15);
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15);

            await mainChannel.send(`**✨ نجـم المعركـة (ضرر: ${mvpPlayer.totalDamage.toLocaleString()}):** <@${mvpPlayer.id}>\nحصل على تعزيز **15%** مورا واكس بي لـ **15د** ${EMOJI_BUFF}`).catch(()=>{});
        }
    }

    try {
        await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة غـادروا بسرعة ...**` });
        setTimeout(() => { thread.delete().catch(()=>{}); }, 10000); 
    } catch(e) { }
}

module.exports = { runDungeon };
