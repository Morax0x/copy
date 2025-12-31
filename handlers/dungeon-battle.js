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
const { cleanName, checkDeaths, handleLeaderSuccession } = require('./dungeon/core/battle-utils'); // ✅ تم إضافة handleLeaderSuccession هنا
const { setupPlayers } = require('./dungeon/core/setup');
const { sendEndMessage } = require('./dungeon/core/end-game');
const { handleOwnerMenu } = require('./dungeon/actions/owner-menu');
const { processMonsterTurn } = require('./dungeon/logic/monster-turn');

// --- Main Dungeon Execution Logic ---

async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId, partyClasses, activeDungeonRequests) {
    const guild = threadChannel.guild;
     
    // حماية إضافية للتحقق من اتصال قاعدة البيانات
    if (!sql || !sql.open) {
        return threadChannel.send("⚠️ **خطأ تقني:** قاعدة البيانات غير متصلة حالياً، الرجاء المحاولة لاحقاً.").catch(() => {});
    }
    ensureInventoryTable(sql); 

    let retreatedPlayers = []; 
     
    // --- متغيرات الأحداث ---
    let isTrapActive = false;
    let trapStartFloor = 0;
     
    // 🔥 متغيرات التحكم في التكرار والتناوب 🔥
    let lastEventFloor = -10; 
    let lastEventType = null; 

    // متغيرات التاجر (مشتركة)
    let merchantState = {
        skipFloors: 0,
        weaknessActive: false,
        isGateJump: false // للتفريق بين قفزة التاجر وقفزة البوابة
    };

    // ============================================================
    // 1️⃣ تجهيز اللاعبين (Setup Phase)
    // ============================================================
    let players = await setupPlayers(guild, partyIDs, partyClasses, sql, OWNER_ID);

    if (players.length === 0) {
        activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ: لم يتم العثور على اللاعبين.").catch(() => {});
    }

    // رسالة الختم
    players.forEach(p => {
        if (p.isSealed) {
             threadChannel.send(`✶ <@${p.id}> تـم ختـم قوتك الى الطابـق 18 لن تتمكن من استعمال قوتك جيدا, الطوابق الدنيا لا تتحمل جبروتك`).catch(() => {});
        }
    });

    const maxFloors = 100; 
    let totalAccumulatedCoins = 0;
    let totalAccumulatedXP = 0;

    // ============================================================
    // 2️⃣ حلقة اللعب الرئيسية (Main Loop)
    // ============================================================
    for (let floor = 1; floor <= maxFloors; floor++) {
        // التحقق من اللاعبين
        if (players.length === 0 || players.every(p => p.isDead)) break; 

        // 🔥 تطبيق تخطي الطوابق (الخريطة المختصرة أو بوابة الأبعاد) 🔥
        if (merchantState.skipFloors > 0) {
            let floorsSkipped = 0;
            let targetFloor = 0;

            if (merchantState.isGateJump) {
                // قفزة محددة برقم الطابق (بوابة الأبعاد)
                targetFloor = merchantState.skipFloors;
                floorsSkipped = targetFloor - floor; // مجرد للعرض
                merchantState.isGateJump = false;
            } else {
                // قفزة بعدد محدد (التاجر)
                floorsSkipped = merchantState.skipFloors;
                targetFloor = floor + floorsSkipped;
            }

            merchantState.skipFloors = 0; // تصفير
            const oldFloor = floor;
            floor = targetFloor; 
             
            if (floor > maxFloors) floor = maxFloors; 

            try {
                await threadChannel.send(`⏩ **انتقال سريع!** تم القفز من الطابق ${oldFloor} إلى ${floor}.`);
            } catch (err) {
                console.log("Error sending message (Unknown Channel likely):", err.message);
                break; 
            }
            continue; 
        }

        // 🔥🔥🔥 التدرج في فك الختم 🔥🔥🔥
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

        // تهيئة اللاعبين للدور (إزالة الدروع القديمة وبفات معينة)
        for (let p of players) {
            if (!p.isDead) { 
                p.shield = p.startingShield || 0;
                p.startingShield = 0; 
                p.effects = p.effects.filter(e => ['poison', 'atk_buff', 'weakness'].includes(e.type));
                p.defending = false; 
                p.summon = null; 
            } 
        }

        // تجهيز الوحش
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

        if (merchantState.weaknessActive) {
            monster.effects.push({ type: 'weakness', val: 0.25, turns: 99 });
            merchantState.weaknessActive = false;
        }

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.maxHp.toLocaleString()} | DMG: ${monster.atk})`];
        if (monster.effects.some(e => e.type === 'weakness')) log.push(`👁️ **تم كشف نقطة ضعف الوحش!** (+25% ضرر إضافي)`);

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

        // ============================================================
        // 3️⃣ حلقة المعركة (Battle Loop)
        // ============================================================
        while (ongoing) {
            const collector = battleMsg.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });
            let actedPlayers = [];
            let processingUsers = new Set(); 
            let ongoingRef = { value: true }; // مرجع للتحكم بالحالة

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
                        
                        // 🔥🔥 نقل القيادة إذا مات القائد بسبب الخمول 🔥🔥
                        handleLeaderSuccession(players, log);

                        if (players.every(p => p.isDead)) { ongoing = false; collector.stop('all_dead'); return; }
                        log.push(`⚠️ تم تخطي دور اللاعبين الخاملين.`);
                        collector.stop('turn_end'); 
                    } else {
                        collector.stop('turn_end');
                    }
                }, 45000); 

                collector.on('collect', async i => {
                     
                    // ============================================================
                    // 🔥 القسم الأول: قائمة الإمبراطور (تم فصلها) 🔥
                    // ============================================================
                    if (i.customId === 'def' && i.user.id === OWNER_ID) {
                        await handleOwnerMenu(i, players, monster, log, threadChannel, sql, guild, hostId, activeDungeonRequests, merchantState, battleMsg, turnTimeout, collector, ongoingRef);
                        // إذا قامت القائمة بإنهاء المعركة (مثل شق الزمكان أو قتل الوحش فوراً)
                        if (!ongoingRef.value) {
                             ongoing = false;
                             // لا نوقف الكوليكتور هنا لأن handleOwnerMenu ربما أوقفه بالفعل، 
                             // لكن للتأكد إذا لم يتوقف:
                             if (!collector.ended) collector.stop('owner_action'); 
                        }
                        return;
                    }

                    // ============================================================
                    // 👑 القسم الثاني: دخول الاونر التلقائي
                    // ============================================================
                    if (i.user.id === OWNER_ID && !players.find(p => p.id === OWNER_ID)) {
                        const member = await i.guild.members.fetch(OWNER_ID).catch(() => null);
                        if (member) {
                             const ownerPlayer = getRealPlayerData(member, sql, '???'); 
                             ownerPlayer.name = cleanName(ownerPlayer.name);
                             players.push(ownerPlayer);
                             log.push(`👑 **الأمبراطـور اقتحـم المعركـة!**`);
                        }
                    }

                    // ============================================================
                    // ⚔️ القسم الثالث: المنطق العادي (اللاعبين) 
                    // ============================================================
                     
                    if (!i.replied && !i.deferred && !i.isStringSelectMenu() && !i.isModalSubmit()) await i.deferUpdate().catch(()=>{});
                     
                    if (processingUsers.has(i.user.id)) return i.followUp({ content: "🚫 اهدأ! طلبك قيد المعالجة.", ephemeral: true }).catch(()=>{});
                     
                    let p = players.find(pl => pl.id === i.user.id);
                    if (!p) return i.followUp({ content: "🚫 لست مشاركاً!", ephemeral: true });
                    if (p.isDead || actedPlayers.includes(p.id)) return;

                    // تحقق من الشلل
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
                                    if (skillObj.effectValue) {
                                        skillObj = { ...skillObj, effectValue: Math.floor(skillObj.effectValue * p.sealMultiplier) };
                                    }
                                }
                                if (floor <= 5 && p.atk > 47) p.atk = 47;
                                else if (floor <= 10 && p.atk > 88) p.atk = 88;
                                else if (floor <= 14 && p.atk > 120) p.atk = 120;

                                const res = handleSkillUsage(p, { ...skillObj, id: skillId }, monster, log, threadChannel, players);
                                 
                                p.atk = originalAtk;

                                if (res && res.error) {
                                    await selection.editReply({ content: res.error, components: [] }).catch(()=>{});
                                    processingUsers.delete(i.user.id); return;
                                }
                                 
                                if (res && res.name) skillNameUsed = res.name;
                                else if (skillObj.name !== 'Skill') skillNameUsed = skillObj.name;

                                actedPlayers.push(p.id); p.skipCount = 0; 
                                await selection.editReply({ content: `✅ تم استخـدام: ${skillNameUsed}`, components: [] }).catch(()=>{});
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

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
                                 
                                // 🔥🔥🔥 تعديل جرعة العملاق 🔥🔥🔥
                                if (potionId === 'potion_titan') {
                                    p.titanPotionUses = p.titanPotionUses || 0;
                                    if (p.titanPotionUses >= 3) {
                                        await selection.followUp({ content: "🚫 **لقد استهلكت الحد الأقصى (3) من جرعة العملاق في هذا الدانجون!**", ephemeral: true });
                                        processingUsers.delete(i.user.id);
                                        return;
                                    }
                                    p.titanPotionUses++; // زيادة العداد
                                }
                                 
                                if (sql.open) {
                                    sql.prepare("UPDATE user_inventory SET quantity = quantity - 1 WHERE userID = ? AND guildID = ? AND itemID = ?").run(p.id, guild.id, potionId);
                                }

                                let actionMsg = "";
                                if (potionId === 'potion_heal') {
                                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                                    actionMsg = "🧪 استعاد 50% HP!";
                                } else if (potionId === 'potion_reflect') {
                                    p.effects.push({ type: 'reflect', val: 0.5, turns: 2 });
                                    actionMsg = "🌵 جهز درع الأشواك!";
                                } else if (potionId === 'potion_time') {
                                    p.special_cooldown = 0; p.skillCooldowns = {};
                                    actionMsg = "⏳ شرب جرعة الزمن وأعاد شحن مهاراته!";
                                } else if (potionId === 'potion_titan') {
                                    p.maxHp *= 2; p.hp = p.maxHp;
                                    p.effects.push({ type: 'titan', turns: 3 }); 
                                    monster.targetFocusId = p.id;
                                    actionMsg = `🔥 تحول لعملاق! (${p.titanPotionUses}/3)`;
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
                                     
                                    // 🔥🔥 نقل القيادة إذا مات القائد بجرعة التضحية 🔥🔥
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

                                    if (floor <= 5 && dmg > 47) dmg = 47;
                                    else if (floor <= 10 && dmg > 88) dmg = 88;
                                    else if (floor <= 14 && dmg > 120) dmg = 120;

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
                    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }
                });

                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            if (monster.hp <= 0) { ongoing = false; await battleMsg.edit({ components: [] }).catch(()=>{}); }

            // تحديث التهدئة
            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                if (p.special_cooldown > 0) p.special_cooldown--; 
                
                // ✅✅ التعديل المطلوب هنا: التحقق من التأثيرات قبل حذفها ✅✅
                p.effects = p.effects.filter(e => { 
                    e.turns--; 
                    if (e.turns <= 0) {
                        // إلغاء تأثير العملاق وإرجاع الحجم الطبيعي
                        if (e.type === 'titan') {
                            p.maxHp = Math.floor(p.maxHp / 2); // استعادة الـ MaxHP الأصلي
                            if (p.hp > p.maxHp) p.hp = p.maxHp; // ضبط الـ HP الحالي
                            log.push(`✨ **${p.name}** عاد لحجمه الطبيعي وتلاشى مفعول العملاق.`);
                        }
                        return false; // حذف التأثير
                    }
                    return true; // إبقاء التأثير
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

            // ============================================================
            // 🔥 منطق الوحش (تم فصله) 🔥
            // ============================================================
            if (monster.hp > 0 && ongoing) {
                turnCount++;
                // الدالة تعيد false إذا مات الوحش أو انتهت المعركة
                ongoing = await processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel);
                 
                // 🔥🔥 التحقق من نقل القيادة بعد هجمة الوحش 🔥🔥
                if (ongoing) {
                    handleLeaderSuccession(players, log);
                }
            }
        }

        if (players.every(p => p.isDead)) {
            const finalFloor = isTrapActive ? trapStartFloor : floor;
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, finalFloor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break;
        }
         
        if (isTrapActive) isTrapActive = false;

        let baseMora = Math.floor(getBaseFloorMora(floor));
        let floorXp = Math.floor(baseMora * 0.03);  
        players.forEach(p => { if (!p.isDead) { p.loot.mora += baseMora; p.loot.xp += floorXp; } });
        totalAccumulatedCoins += baseMora;
        totalAccumulatedXP += floorXp;

        // ==========================================
        // ❖ منطقة الاستراحة (Floor Rest) ❖
        // ==========================================
        const specificRetreatFloors = [38, 50, 80];
        const canRetreat = floor <= 20 || specificRetreatFloors.includes(floor);

        let restDesc = `✶ نجحتـم في تصفية الطابق الـ: **${floor}**\n✶ تم استعادة صحة المغامرين بنسبة **%30**\n\n**✶ الغنـائـم المتراكمة:**\n✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}\n✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}`;

        const restRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success)
        );

        if (floor === 20) {
             restDesc += `\n\n✥ **تحذيـر:** التوغل اكثر بالدانجون محفوف بالمخاطر الاستمرار الان سيمنعكم من الانسحـاب في معظم الطوابق`;
        } else if (floor > 20) {
             restDesc += `\n\n✥ **تحذيـر:** المنطقة خطرة - الانسحاب غير متاح في أغلب الطوابق!`;
        } else {
             restDesc += `\n\n- القرار بيد **القائد** للاستمرار أو الانسحاب!`;
        }

        if (canRetreat) {
             restRow.addComponents(new ButtonBuilder().setCustomId('retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger));
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
                    // 🔥🔥 نستخدم كلاس القائد للتحقق بدل الهوست آيدي 🔥🔥
                    // إذا كان اللاعب القائد، يسمح له بالضغط
                    let p = players.find(pl => pl.id === i.user.id);
                    if (!p || p.class !== 'Leader') return i.reply({ content: "🚫 **فقط القائد يمكنه اختيار الاستمرار!**", ephemeral: true });
                     
                    await i.deferUpdate(); 
                    return decCollector.stop('continue');
                }

                if (i.customId === 'retreat' && canRetreat) {
                    let p = players.find(pl => pl.id === i.user.id);
                     
                    if (p && p.class === 'Leader') {
                        // إذا القائد انسحب، ننهي الدنجن للجميع
                        await i.deferUpdate();
                        return decCollector.stop('retreat');
                    } else {
                        // انسحاب فردي
                        const pIndex = players.findIndex(pl => pl.id === i.user.id);
                        if (pIndex > -1) {
                            const leavingPlayer = players[pIndex];
                            leavingPlayer.retreatFloor = floor;
                            retreatedPlayers.push(leavingPlayer);
                            players.splice(pIndex, 1); 
                            await i.reply({ content: `👋 **لقد انسحبت من الدانجون واكتفيت بغنائمك!**`, ephemeral: true });
                            await threadChannel.send(`💨 **${leavingPlayer.name}** قـرر الانسحاب والاكتفاء بما حصد من غنائم!`).catch(()=>{});
                             
                            // 🔥🔥 نقل القيادة إذا كان القائد السابق هو من انسحب (للاحتياط) 🔥🔥
                            // رغم أن الشرط أعلاه يمنع القائد من الانسحاب الفردي، لكن هذا أمان إضافي
                            if (leavingPlayer.class === 'Leader') handleLeaderSuccession(players, log);

                            if (players.length === 0) decCollector.stop('retreat');
                        } else {
                            await i.reply({ content: "أنت لست في قائمة المشاركين النشطين.", ephemeral: true });
                        }
                    }
                }
            });
            decCollector.on('end', (c, reason) => { clearTimeout(warningTimeout); res(reason); });
        });

        await restMsg.edit({ components: [] }).catch(()=>{});

        if (decision === 'time') { 
            players.forEach(p => { p.isDead = true; p.hp = 0; });
            await threadChannel.send(`☠️ **انتهى الوقت!** ابتلع الدانجون الفريق بأكمله بسبب تردد القائد...`).catch(()=>{});
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break; 
        } 
        else if (decision === 'retreat') {
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
            return;
        } 
        else if (decision === 'continue') {
            // فخ الشذوذ الزمكاني
            if (floor > 10 && floor < 90 && Math.random() < 0.01) { 
                isTrapActive = true;
                trapStartFloor = floor;
                const minTarget = floor + 2;
                const maxTarget = 95;
                const targetFloor = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
                floor = targetFloor - 1; 

                const trapEmbed = new EmbedBuilder()
                    .setTitle('⚠️ انـذار: شـذوذ زمـكـانـي!')
                    .setDescription(`🌀 **لقد وقعتم في فخ الأبعاد!**\nتم قذفكم قسراً للأمام إلى الطابق **${targetFloor}**!\n\n☠️ الوحوش هنا لا ترحم... النجاة شبه مستحيلة!`)
                    .setColor(Colors.DarkRed)
                    .setThumbnail('https://media.discordapp.net/attachments/1145327691772481577/115000000000000000/blackhole.gif'); 
                await threadChannel.send({ embeds: [trapEmbed] }).catch(()=>{});
            } else {
                await threadChannel.send(`⚔️ **يتوغل الفريق بالدانجون نحو طوابق أعمق...**`).catch(()=>{});

                // 🔥🔥 تم إلغاء كود نقل القيادة القديم هنا لأنه أصبح مكرراً وغير ضروري 🔥🔥
                // 🔥🔥 نعتمد الآن كلياً على handleLeaderSuccession 🔥🔥

                // نظام الأحداث
                const canTriggerEvent = (floor - lastEventFloor) > 4;
                if (canTriggerEvent && floor > 5 && !isTrapActive && Math.random() < 0.30) {
                    let eventToTrigger = '';
                    if (lastEventType === 'merchant') eventToTrigger = 'chest'; 
                    else if (lastEventType === 'chest') eventToTrigger = 'merchant'; 
                    else eventToTrigger = Math.random() < 0.5 ? 'merchant' : 'chest';

                    if (eventToTrigger === 'merchant') {
                        await triggerMysteryMerchant(threadChannel, players, sql, guild.id, merchantState);
                        lastEventType = 'merchant'; lastEventFloor = floor;
                        await new Promise(r => setTimeout(r, 46000));
                    } else {
                        await triggerMimicChest(threadChannel, players);
                        lastEventType = 'chest'; lastEventFloor = floor;
                        await new Promise(r => setTimeout(r, 62000));
                    }
                }
            }
        }
        players.forEach(p => { if(!p.isDead) p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.3)); });
    }
}

module.exports = { runDungeon };
