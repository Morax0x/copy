const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { 
    dungeonConfig, EMOJI_MORA, EMOJI_XP, EMOJI_BUFF, EMOJI_NERF, 
    OWNER_ID, WIN_IMAGES, LOSE_IMAGES 
} = require('./dungeon/constants');
const { 
    ensureInventoryTable, getRandomImage, getBaseFloorMora, applyDamageToPlayer, 
    getRealPlayerData, getRandomMonster, getSmartTarget 
} = require('./dungeon/utils');
const { GENERIC_MONSTER_SKILLS, MONSTER_SKILLS } = require('./dungeon/monsters');
const { handleSkillUsage } = require('./dungeon/skills');
const { 
    generateBattleEmbed, generateBattleRows, buildSkillSelector, buildPotionSelector 
} = require('./dungeon/ui');

// 🟢 MAIN RUN DUNGEON FUNCTION
async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId, partyClasses, activeDungeonRequests) {
    const guild = threadChannel.guild;
    ensureInventoryTable(sql); 

    let players = [];
    let retreatedPlayers = [];
      
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

    // متغيرات الفخ
    let trapStartFloor = 0; // الطابق الذي ظهر فيه الفخ (قبل الانتقال)
    let isTrapActive = false; // هل نحن في طابق فخ؟

    // 🔥 حلقة الطوابق 🔥
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

        // 🔥 إعداد الوحش الثاني (فوق طابق 20) 🔥
        let subMonster = null;
        if (floor > 20) {
            // يبدأ من 100 ويزيد 100 مع كل طابق فوق الـ 20
            const subHp = 100 + ((floor - 20) * 100);
            subMonster = {
                name: `تابع ${randomMob.name}`,
                hp: subHp, maxHp: subHp, atk: Math.floor(finalAtk * 0.6), // ضربه أخف
                effects: [], frozen: false
            };
        }

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.maxHp.toLocaleString()} | DMG: ${monster.atk})`];
        if (subMonster) log.push(`➕ ظهر معه **${subMonster.name}** (HP: ${subMonster.maxHp})!`);
        if (isTrapActive) log.push(`🌀 **أنتم الآن في طابق الفخ!** (فشل = جوائز طابق ${trapStartFloor})`);

        let ongoing = true;
        let turnCount = 0;

        // 🔥 استخدام generateBattleEmbed المعدلة لدعم وحشين 🔥
        let battleMsg = await threadChannel.send({ 
            embeds: [generateBattleEmbed(players, monster, subMonster, floor, theme, log, [])], 
            components: generateBattleRows() 
        });

        // --- Battle Loop ---
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
                                
                                const skillId = selection.values[0];
                                
                                // 🔥 معالجة مهارات الأونر الخاصة (فخ / انتقال) 🔥
                                if (skillId === 'skill_owner_trap') {
                                    await selection.update({ content: "🌀 تم تفعيل الفخ يدوياً!", components: [] });
                                    floor = Math.floor(Math.random() * (90 - 31 + 1)) + 31; // نقل لطابق عشوائي فوق 30
                                    trapStartFloor = floor - 1; 
                                    isTrapActive = true;
                                    log.push(`🕳️ **الأونر** فتح بوابة بعدية! الانتقال للطابق **${floor}**...`);
                                    ongoing = false; // إنهاء الطابق الحالي فوراً
                                    collector.stop('trap_trigger');
                                    processingUsers.delete(i.user.id);
                                    return;
                                }
                                
                                if (skillId === 'skill_owner_teleport') {
                                    // إظهار مودال للكتابة
                                    const modal = new ModalBuilder()
                                        .setCustomId('teleport_modal')
                                        .setTitle('الانتقال الآني 🚀');
                                    const floorInput = new TextInputBuilder()
                                        .setCustomId('floor_input')
                                        .setLabel("رقم الطابق (1-100)")
                                        .setStyle(TextInputStyle.Short);
                                    modal.addComponents(new ActionRowBuilder().addComponents(floorInput));
                                    await selection.showModal(modal);
                                    
                                    // انتظار الرد على المودال
                                    const modalSubmit = await selection.awaitModalSubmit({ time: 30000 });
                                    const targetFloor = parseInt(modalSubmit.fields.getTextInputValue('floor_input'));
                                    if (isNaN(targetFloor) || targetFloor < 1 || targetFloor > 100) {
                                        await modalSubmit.reply({ content: "رقم غير صحيح!", ephemeral: true });
                                    } else {
                                        await modalSubmit.reply({ content: `🚀 جاري الانتقال للطابق ${targetFloor}...`, ephemeral: true });
                                        floor = targetFloor - 1; // -1 because loop increments
                                        log.push(`🚀 **الأونر** نقل الفريق للطابق **${targetFloor}**!`);
                                        ongoing = false;
                                        collector.stop('teleport');
                                        processingUsers.delete(i.user.id);
                                        return;
                                    }
                                } 
                                // --- معالجة المهارات العادية ---
                                else {
                                    if (!selection.replied && !selection.deferred) await selection.deferUpdate().catch(()=>{}); 

                                    const shieldSkills = ['skill_shielding', 'race_human_skill'];
                                    if (shieldSkills.includes(skillId) && p.shield > 0) {
                                        await selection.followUp({ content: `🛡️ **لديك درع نشط بالفعل!**`, ephemeral: true });
                                        processingUsers.delete(i.user.id); return; 
                                    }

                                    let skillNameUsed = "مهارة";
                                    let skillObj = { id: skillId, name: 'Skill', effectValue: 0 };
                                    
                                    // تجهيز كائن المهارة
                                    if (skillId.startsWith('class_') || skillId === 'skill_secret_owner' || skillId === 'skill_owner_leave') {
                                        // لا نحتاج تجهيز، سيتم التعامل داخل handleSkillUsage
                                    } else if (p.skills[skillId]) {
                                        skillObj = p.skills[skillId];
                                    } else if (p.id === OWNER_ID) {
                                        // للأونر
                                        // ...
                                    }

                                    const res = handleSkillUsage(p, skillObj, monster, log, threadChannel, players);
                                    
                                    if (res && res.error) {
                                        await selection.editReply({ content: res.error, components: [] }).catch(()=>{});
                                        processingUsers.delete(i.user.id); return;
                                    }
                                    
                                    // (إعادة استخدام نفس منطق تسمية المهارات والكلاسات السابق...)
                                    if (res && res.type === 'class_effect') {
                                        // ... (نفس كود الكلاسات السابق) ...
                                        // لتوفير المساحة سأفترض أنه موجود، عليك نسخه أو الاعتماد على الكود السابق
                                        // سأضع المثال للـ Priest فقط للتذكير
                                        if (res.effect === 'priest_heal') {
                                             const dead = players.filter(m => m.isDead && !m.isPermDead); 
                                             if (dead.length > 0) { /* revive logic */ } 
                                             else { /* heal logic */ }
                                             skillNameUsed = "النور المقدس";
                                        }
                                        // ...
                                        if (res.cooldown && res.effect !== 'priest_heal') p.special_cooldown = res.cooldown;
                                    } else if (res && res.type === 'owner_leave') {
                                        players = players.filter(pl => pl.id !== OWNER_ID);
                                        if (players.length === 0) { collector.stop('monster_dead'); return; }
                                        skillNameUsed = "رحيل بصمت";
                                    } else {
                                        skillNameUsed = skillObj.name || skillId;
                                        if (skillId !== 'skill_secret_owner' && p.id !== OWNER_ID) p.skillCooldowns[skillId] = skillObj.cooldown || 3;
                                    }

                                    actedPlayers.push(p.id); 
                                    p.skipCount = 0; 
                                    await selection.editReply({ content: `✅ تم استخدام: ${skillNameUsed}`, components: [] }).catch(()=>{});
                                    await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, subMonster, floor, theme, log, actedPlayers)] }).catch(()=>{});
                                }

                            } catch (err) { 
                                processingUsers.delete(i.user.id); return; 
                            }
                        } 
                        else if (i.customId === 'heal') {
                            // ... (نفس كود الجرعات) ...
                            const potionRow = buildPotionSelector(p, sql, guild.id);
                            if (!potionRow) {
                                await i.followUp({ content: "❌ لا تملك جرعات في حقيبتك!", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            // ... (إكمال كود الجرعات كما هو) ...
                            // ...
                            actedPlayers.push(p.id); p.skipCount = 0;
                            // ...
                            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, subMonster, floor, theme, log, actedPlayers)] }).catch(()=>{});
                        }
                        else if (i.customId === 'atk' || i.customId === 'def') {
                            if (!i.replied && !i.deferred) await i.deferUpdate().catch(()=>{});
                            actedPlayers.push(p.id); p.skipCount = 0;
                            if (i.customId === 'atk') {
                                let canAttack = true;
                                // (نفس فحوصات الارتباك والعمى)
                                // ...

                                if (canAttack) {
                                    let atkMultiplier = 1.0;
                                    p.effects.forEach(e => { if(e.type === 'atk_buff') atkMultiplier += e.val; });
                                    const currentAtk = Math.floor(p.atk * atkMultiplier);
                                    let dmg = Math.floor(currentAtk * (0.9 + Math.random() * 0.2));
                                    
                                    // 🔥🔥 تحديد الهدف (وحش كبير أو صغير) 🔥🔥
                                    let targetToHit = monster;
                                    if (subMonster && subMonster.hp > 0) {
                                        // 50% فرصة لضرب الصغير
                                        if (Math.random() < 0.5) targetToHit = subMonster;
                                    }
                                    if (targetToHit.hp <= 0) targetToHit = monster;

                                    targetToHit.hp -= dmg; p.totalDamage += dmg; 
                                    log.push(`🗡️ **${p.name}** ضرب **${targetToHit.name}** بـ ${dmg} ضرر.`);
                                }
                            } else if (i.customId === 'def') {
                                p.defending = true; log.push(`🛡️ **${p.name}** يدافع!`);
                            }
                            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, subMonster, floor, theme, log, actedPlayers)] }).catch(()=>{});
                        }

                        // التحقق من موت الجميع (الوحشين)
                        const mainDead = monster.hp <= 0;
                        const subDead = !subMonster || subMonster.hp <= 0;

                        if (mainDead && subDead) {
                            monster.hp = 0; if(subMonster) subMonster.hp = 0;
                            ongoing = false; collector.stop('monster_dead'); return; 
                        }
                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
                            clearTimeout(turnTimeout); collector.stop('turn_end'); 
                        }
                    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }
                });

                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            // إذا توقف بسبب تفعيل فخ، ننتقل للطابق التالي فوراً
            if (!ongoing && isTrapActive && floor > trapStartFloor) continue;

            if (monster.hp <= 0 && (!subMonster || subMonster.hp <= 0)) { ongoing = false; await battleMsg.edit({ components: [] }).catch(()=>{}); }

            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                if (p.special_cooldown > 0) p.special_cooldown--; 
                p.effects = p.effects.filter(e => { e.turns--; return e.turns > 0; });
            });

            if (turnCount % 3 === 0 && ongoing) {
                await battleMsg.delete().catch(()=>{});
                battleMsg = await threadChannel.send({ 
                    embeds: [generateBattleEmbed(players, monster, subMonster, floor, theme, log, [])], 
                    components: generateBattleRows() 
                });
            }

            // --- دور العدو (Enemy Turn) ---
            if ((monster.hp > 0 || (subMonster && subMonster.hp > 0)) && ongoing) {
                turnCount++;
                
                // هجوم الوحش الكبير
                if (monster.frozen) { log.push(`❄️ **${monster.name}** متجمد!`); monster.frozen = false; } 
                else if (monster.hp > 0) {
                    // (نفس منطق التأثيرات السم/الحرق على الوحش)
                    // ...
                    
                    const alive = players.filter(p => !p.isDead);
                    // (نفس منطق المهارات العشوائية للوحش)
                    // ... (سأضع الهجوم العادي اختصاراً)
                    if (alive.length > 0) {
                        let target = getSmartTarget(players) || alive[Math.floor(Math.random() * alive.length)];
                        if (target) {
                            let dmg = Math.floor(monster.atk * (1 + turnCount * 0.05));
                            if(target.defending) dmg = Math.floor(dmg * 0.5);
                            applyDamageToPlayer(target, dmg);
                            log.push(`👹 **${monster.name}** ضرب **${target.name}** (${dmg})`);
                        }
                    }
                }

                // 🔥 هجوم الوحش الصغير 🔥
                if (subMonster && subMonster.hp > 0 && !subMonster.frozen) {
                    const alive = players.filter(p => !p.isDead);
                    if (alive.length > 0) {
                        let target = alive[Math.floor(Math.random() * alive.length)];
                        let dmg = subMonster.atk;
                        if(target.defending) dmg = Math.floor(dmg * 0.5);
                        applyDamageToPlayer(target, dmg);
                        log.push(`👾 **${subMonster.name}** ضرب **${target.name}** (${dmg})`);
                    }
                }

                if (players.every(p => p.isDead)) ongoing = false;
                else {
                    if (log.length > 5) log = log.slice(-5);
                    await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, subMonster, floor, theme, log, [])] }).catch(()=>{});
                }
            }
        } // End While Loop

        // التحقق من الخسارة النهائية
        if (players.every(p => p.isDead)) {
            // 🔥 منطق الجوائز عند الخسارة في فخ 🔥
            // اذا كنا في فخ، الجائزة تحسب للطابق قبل الفخ (trapStartFloor)
            const rewardFloor = isTrapActive ? trapStartFloor : floor;
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, rewardFloor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break;
        }

        // حساب الجوائز للطابق الحالي
        let baseMora = Math.floor(getBaseFloorMora(floor));
        let floorXp = Math.floor(baseMora / 3); 
        
        // 🔥 ملاحظة: نحن نضيف الجائزة للمتغير المؤقت loot داخل كائن اللاعب
        // إذا مات في الفخ لاحقاً، سنقوم بتسليمه ما في هذا المتغير فقط (مخصوماً منه 50% للموت)
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
            // 🔥 منطق الجوائز عند الانسحاب في فخ (نادر الحدوث لكن للاحتياط) 🔥
            const rewardFloor = isTrapActive ? trapStartFloor : floor;
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, rewardFloor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
            return;
        } else if (decision === 'continue') {
            
            // 🔥🔥🔥 منطق الفخ العشوائي (1% فرصة، فوق طابق 10) 🔥🔥🔥
            if (!isTrapActive && floor > 10) {
                if (Math.random() < 0.01) { // 1%
                    trapStartFloor = floor; // حفظ الطابق الآمن الأخير
                    const jumpTo = Math.floor(Math.random() * (90 - 31 + 1)) + 31; // عشوائي فوق 30
                    
                    isTrapActive = true;
                    floor = jumpTo - 1; // ضبط العداد ليقفز
                    
                    await threadChannel.send(`🌀 **فــخ!!!** الأرضية تنهار بكم وتسقطون إلى أعماق الدانجون... (الطابق ${jumpTo})`);
                } else {
                    await threadChannel.send(`**⚔️ قـرر القائد الاستمرار! يتوغل الفريق بالدانجون نحو طوابق أعمق...**`);
                }
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
