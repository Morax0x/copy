const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, ChannelType, Colors } = require('discord.js');
const path = require('path');

// تحميل الإعدادات
const rootDir = process.cwd();
const dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

// --- ثوابت النظام ---
const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const BASE_HP = 100;
const HP_PER_LEVEL = 4;
const DUNGEON_COOLDOWN = 3 * 60 * 60 * 1000; // 3 ساعات
const OWNER_ID = "1145327691772481577"; // 👑 آيدي الأونر

// تتبع اللاعبين النشطين (لمنع السبام)
const activeDungeonRequests = new Set();

// --- صور النتائج ---
const WIN_IMAGES = [
    'https://i.postimg.cc/JhMrnyLd/download-1.gif',
    'https://i.postimg.cc/FHgv29L0/download.gif',
    'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
    'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
    'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
    'https://i.postimg.cc/05dLktNF/download-5.gif',
    'https://i.postimg.cc/sXRVMwhZ/download-2.gif'
];

const LOSE_IMAGES = [
    'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif',
    'https://i.postimg.cc/1zb8JGVC/download.gif',
    'https://i.postimg.cc/rmSwjvkV/download-1.gif',
    'https://i.postimg.cc/8PyPZRqt/download.jpg'
];

// --- دوال مساعدة ---

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\DFFF]|\uD83D[\uDC00-\DFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\DFFF]/g, '');
    return clean.trim();
}

function buildHpBar(currentHp, maxHp, shield = 0) {
    currentHp = Math.max(0, currentHp);
    const percentage = (currentHp / maxHp) * 10;
    const filled = '█';
    const empty = '░';
    let bar = `[${filled.repeat(Math.max(0, Math.floor(percentage))) + empty.repeat(Math.max(0, 10 - Math.floor(percentage)))}] ${currentHp}/${maxHp}`;
    if (shield > 0) bar += ` 🛡️(${shield})`;
    return bar;
}

function getRealPlayerData(member, sql) {
    const guildID = member.guild.id;
    const userID = member.id;
    const userData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
    const level = userData ? userData.level : 1;
    const maxHp = BASE_HP + (level * HP_PER_LEVEL);

    let damage = 15;
    let weaponName = "قبضة اليد";
    
    // جلب العرق والسلاح
    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(member.guild.id);
    const userRoleIDs = member.roles.cache.map(r => r.id);
    const userRace = allRaceRoles.find(r => userRoleIDs.includes(r.roleID));

    if (userRace) {
        const weaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
        if (weaponConfig) {
            const userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(userID, guildID, userRace.raceName);
            if (userWeapon && userWeapon.weaponLevel > 0) {
                damage = weaponConfig.base_damage + (weaponConfig.damage_increment * (userWeapon.weaponLevel - 1));
                weaponName = `${weaponConfig.name} (Lv.${userWeapon.weaponLevel})`;
            }
        }
    }

    // جلب المهارات
    const skillsOutput = {};
    const userSkillsData = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ?").all(member.id, member.guild.id);
    
    if (userSkillsData) {
        userSkillsData.forEach(userSkill => {
            const skillConfig = skillsConfig.find(s => s.id === userSkill.skillID);
            if (skillConfig && userSkill.skillLevel > 0) {
                const effectValue = skillConfig.base_value + (skillConfig.value_increment * (userSkill.skillLevel - 1));
                skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: userSkill.skillLevel, effectValue: effectValue };
            }
        });
    }

    if (userRace) {
        const raceSkillId = `race_${userRace.raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
        const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
        if (raceSkillConfig && !skillsOutput[raceSkillId]) {
            skillsOutput[raceSkillId] = { ...raceSkillConfig, currentLevel: 1, effectValue: raceSkillConfig.base_value };
        }
    }

    return {
        id: userID,
        name: cleanDisplayName(member.displayName),
        avatar: member.user.displayAvatarURL(),
        level: level,
        hp: maxHp,
        maxHp: maxHp,
        atk: damage,
        weaponName: weaponName,
        skills: skillsOutput,
        isDead: false,
        defending: false,
        potions: 3,
        skillCooldowns: {},
        shield: 0,
        tempAtkMultiplier: 1.0,
        effects: [],
        totalDamage: 0,
        loot: { mora: 0, xp: 0 } // تتبع الغنائم الخاصة بكل لاعب
    };
}

function getRandomMonster(type, theme) {
    let pool = [];
    if (type === 'boss') pool = dungeonConfig.monsters.bosses;
    else if (type === 'elite' || type === 'guardian') pool = dungeonConfig.monsters.elites;
    else pool = dungeonConfig.monsters.minions;
    const name = pool[Math.floor(Math.random() * pool.length)];
    return { name, emoji: theme.emoji };
}

function buildSkillSelector(player) {
    const userSkills = player.skills || {};
    const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
    
    if (availableSkills.length === 0) return null;

    const options = availableSkills.map(skill => {
        const cooldown = player.skillCooldowns[skill.id] || 0;
        const description = cooldown > 0 ? `🕓 كولداون: ${cooldown} جولات` : `⚡ ${skill.description}`;
        return new StringSelectMenuOptionBuilder()
            .setLabel(skill.name)
            .setValue(skill.id)
            .setDescription(description.substring(0, 100))
            .setEmoji(skill.emoji || '✨');
    });

    const slicedOptions = options.slice(0, 25);

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('skill_select_menu')
            .setPlaceholder('اختر مهارة لاستخدامها...')
            .addOptions(slicedOptions)
    );
    return row;
}

// --- معالجة منطق المهارات ---
function handleSkillUsage(player, skill, monster, log) {
    let skillDmg = 0;
    const value = skill.effectValue; 

    switch (skill.id) {
        case 'skill_healing':
        case 'skill_cleanse':
            let healAmount = Math.floor(player.maxHp * (value / 100));
            if (skill.id === 'skill_cleanse') {
                player.effects = []; 
                log.push(`✨ **${player.name}** تطهر من السموم وشفى **${healAmount}** HP.`);
            } else {
                log.push(`❤️‍🩹 **${player.name}** استخدم ${skill.name} واستعاد **${healAmount}** HP.`);
            }
            player.hp = Math.min(player.maxHp, player.hp + healAmount);
            break;

        case 'skill_shielding':
        case 'race_dwarf_skill':
        case 'race_human_skill':
             let shieldAmount = Math.floor(player.maxHp * (value / 100));
             player.shield += shieldAmount;
             log.push(`${skill.emoji} **${player.name}** اكتسب درعاً بقوة **${shieldAmount}**.`);
             if (skill.id === 'race_human_skill') {
                 player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
                 log.push(`⚔️ **${player.name}** زادت عزيمته (ATK UP)!`);
             }
             break;

        case 'skill_buffing':
             player.effects.push({ type: 'atk_buff', val: (value / 100), turns: 3 });
             log.push(`💪 **${player.name}** رفع قوته الهجومية بنسبة **${value}%** لـ 3 جولات!`);
             break;

        case 'skill_poison':
        case 'race_dark_elf_skill':
             skillDmg = Math.floor(player.atk * 0.5); 
             monster.effects.push({ type: 'poison', val: Math.floor(player.atk * (value/100)), turns: 3 });
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`☠️ **${player.name}** سمم الوحش! (ضرر ${skillDmg} + سم مستمر).`);
             break;

        case 'skill_gamble':
             const roll = Math.random();
             if (roll > 0.5) {
                 skillDmg = Math.floor(player.atk * 2.5); 
                 log.push(`🎲 **${player.name}** ربح المقامرة! ضربة هائلة **${skillDmg}**!`);
             } else {
                 skillDmg = Math.floor(player.atk * 0.25); 
                 log.push(`🎲 **${player.name}** خسر المقامرة... خدش بسيط **${skillDmg}**.`);
             }
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             break;
        
        case 'race_dragon_skill':
        case 'race_spirit_skill':
             skillDmg = Math.floor(player.atk * 1.5) + value;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🔥 **${player.name}** أطلق ${skill.name} مخترقاً الدفاع بـ **${skillDmg}** ضرر!`);
             break;

        case 'race_seraphim_skill':
        case 'race_vampire_skill':
             skillDmg = Math.floor(player.atk * 1.2) + value;
             const lifesteal = Math.floor(skillDmg * (skill.id === 'race_vampire_skill' ? 0.5 : 0.3));
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             player.hp = Math.min(player.maxHp, player.hp + lifesteal);
             log.push(`${skill.emoji} **${player.name}** امتص حياة الخصم! (**${skillDmg}** ضرر / **+${lifesteal}** HP).`);
             break;

        case 'race_demon_skill':
             const selfDmg = Math.floor(player.maxHp * 0.10);
             skillDmg = Math.floor(player.atk * 2.0) + value;
             player.hp -= selfDmg;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🩸 **${player.name}** ضحى بدمه (**-${selfDmg}**) ليسبب دماراً شاملاً **${skillDmg}**!`);
             break;

        case 'race_elf_skill':
             const hit1 = Math.floor(player.atk * 0.8);
             const hit2 = Math.floor(player.atk * 0.8);
             skillDmg = hit1 + hit2;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🏹 **${player.name}** أطلق سهمين سريعين! (**${hit1}** + **${hit2}** = **${skillDmg}**).`);
             break;
        
        case 'skill_weaken':
        case 'race_ghoul_skill':
             skillDmg = Math.floor(player.atk * 0.5);
             monster.effects.push({ type: 'weakness', val: 0.25, turns: 2 }); 
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`📉 **${player.name}** أضعف هجوم الوحش وسبب **${skillDmg}** ضرر.`);
             break;
        
        case 'skill_dispel':
            monster.effects = monster.effects.filter(e => e.type === 'poison'); 
            log.push(`💨 **${player.name}** بدد السحر عن الوحش!`);
            break;

        case 'race_hybrid_skill':
            const rand = Math.random();
            if (rand < 0.33) {
                let h = Math.floor(player.maxHp * 0.2);
                player.hp = Math.min(player.maxHp, player.hp + h);
                log.push(`🌀 **${player.name}** تكيف (شفاء **${h}**).`);
            } else if (rand < 0.66) {
                let s = Math.floor(player.maxHp * 0.2);
                player.shield += s;
                log.push(`🌀 **${player.name}** تكيف (درع **${s}**).`);
            } else {
                player.effects.push({ type: 'atk_buff', val: 0.15, turns: 2 });
                log.push(`🌀 **${player.name}** تكيف (قوة هجومية).`);
            }
            break;

        default:
            let multiplier = skill.stat_type === '%' ? (1 + (value/100)) : 1;
            skillDmg = Math.floor((player.atk * multiplier) + (skill.stat_type !== '%' ? value : 0));
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`💥 **${player.name}** استخدم ${skill.name} مسبباً **${skillDmg}** ضرر!`);
            break;
    }
}

// --- الهاندلر الرئيسي ---

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    // ⛔ منع السبام
    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ 
            content: "🚫 **لديك طلب دانجون نشط بالفعل!** أكمل السابق أو انتظر انتهاءه.", 
            ephemeral: true 
        });
    }

    // ✅ 1. التحقق من مستوى القائد (مطلوب 10+)
    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 10) {
        return interaction.reply({ 
            content: "مـا زلـت رحالاً يا غـلام يجب ان تصل للمستوى 10 لتحصل على تصريح دخول الدانجون", 
            ephemeral: true 
        });
    }

    activeDungeonRequests.add(user.id);

    // فحص الكولداون
    if (user.id !== OWNER_ID) {
        const lastRun = sql.prepare("SELECT last_dungeon FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
        if (lastRun && lastRun.last_dungeon) {
            const timeLeft = DUNGEON_COOLDOWN - (Date.now() - lastRun.last_dungeon);
            if (timeLeft > 0) {
                activeDungeonRequests.delete(user.id);
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                return interaction.reply({ 
                    content: `⏳ **يجب عليك الانتظار!**\nيمكنك طلب دانجون جديد بعد **${hours} ساعة و ${minutes} دقيقة**.\n*(يمكنك الانضمام لفريق شخص آخر)*`, 
                    ephemeral: true 
                });
            }
        }
    }

    const themes = Object.keys(dungeonConfig.themes);
    const buttons = themes.map(key => {
        const theme = dungeonConfig.themes[key];
        return new ButtonBuilder()
            .setCustomId(`dungeon_theme_${key}`)
            .setLabel(theme.name)
            .setEmoji(theme.emoji)
            .setStyle(ButtonStyle.Secondary);
    });

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    
    if (buttons.length > 0) row1.addComponents(buttons.slice(0, 2));
    if (buttons.length > 2) row2.addComponents(buttons.slice(2, 4));

    const components = [row1];
    if (row2.components.length > 0) components.push(row2);

    const embed = new EmbedBuilder()
        .setTitle('⚔️ بوابة الدانجون')
        .setDescription(`مرحباً **${user.username}**!\nاختر المنطقة التي تريد استكشافها:`)
        .setColor('#2B2D31')
        .setImage('https://i.postimg.cc/NMkWVyLV/line.png');

    const msg = await interaction.reply({ embeds: [embed], components: components, fetchReply: true });

    const filter = i => i.user.id === user.id && i.customId.startsWith('dungeon_theme_');
    const collector = msg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async i => {
        const themeKey = i.customId.replace('dungeon_theme_', '');
        const theme = dungeonConfig.themes[themeKey];
        await lobbyPhase(i, theme, sql); 
    });

    collector.on('end', (c, reason) => {
        if (reason === 'time') {
            activeDungeonRequests.delete(user.id); 
            if (msg.editable) msg.edit({ content: "⏰ انتهى وقت الاختيار.", components: [] }).catch(()=>{});
        }
    });
}

async function lobbyPhase(interaction, theme, sql) {
    const host = interaction.user;
    let party = [host.id];
    
    const updateEmbed = () => {
        const memberList = party.map((id, i) => `\`${i+1}.\` <@${id}> ${id === host.id ? '👑' : ''}`).join('\n');
        return new EmbedBuilder()
            .setTitle(`${theme.emoji} بوابة الدانجون: ${theme.name}`)
            .setDescription(`**القائد:** ${host}\n**مستوى الانضمام المطلوب:** 5 وما فوق\n**التكلفة:** 100 ${EMOJI_MORA}\n\n👥 **الفريق:**\n${memberList}`)
            .setColor('DarkRed')
            .setThumbnail(host.displayAvatarURL());
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('start').setLabel('انطلاق').setStyle(ButtonStyle.Danger).setEmoji('⚔️')
    );

    await interaction.update({ content: null, embeds: [updateEmbed()], components: [row] });
    const msg = await interaction.message;
    
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'join') {
            if (party.includes(i.user.id)) return i.reply({ content: "⚠️ أنت منضم بالفعل.", ephemeral: true });
            if (party.length >= 5) return i.reply({ content: "🚫 الفريق ممتلئ.", ephemeral: true });
            
            // ✅ 2. التحقق من مستوى المنضم (مطلوب 5+)
            const joinerData = sql.prepare("SELECT level, mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
            if (!joinerData || joinerData.level < 5) {
                return i.reply({ 
                    content: "🚫 عذراً، يجب أن يكون مستواك **5** أو أعلى للانضمام إلى فرق الدانجون.", 
                    ephemeral: true 
                });
            }

            if (joinerData.mora < 100) return i.reply({ content: `❌ ليس لديك 100 ${EMOJI_MORA}.`, ephemeral: true });
            
            party.push(i.user.id);
            await i.update({ embeds: [updateEmbed()] });

            // 🔥 بدء تلقائي عند اكتمال العدد 🔥
            if (party.length >= 5) {
                collector.stop('start');
            }

        } else if (i.customId === 'start') {
            if (i.user.id !== host.id) return i.reply({ content: "⛔ فقط القائد يمكنه البدء.", ephemeral: true });
            collector.stop('start');
        }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            party.forEach(id => {
                const now = Date.now();
                if (id === host.id && id !== OWNER_ID) {
                    sql.prepare("UPDATE levels SET mora = mora - 100, last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, interaction.guild.id);
                } else {
                    sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, interaction.guild.id);
                }
            });

            try {
                // 🔥 ثريد عام الآن 🔥
                const thread = await msg.channel.threads.create({
                    name: `⚔️ دانجون ${host.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread, 
                    reason: 'Start Dungeon Battle'
                });

                await thread.send({ content: `🔔 **بدأت المعركة!** استعدوا يا أبطال: ${party.map(id => `<@${id}>`).join(' ')}` });
                
                if (msg.editable) await msg.edit({ content: `✅ **انطلقت المعركة في الثريد!** <#${thread.id}>`, components: [] });

                await runDungeon(thread, msg.channel, party, theme, sql, host.id);

            } catch (err) {
                console.error("Error creating thread:", err);
                activeDungeonRequests.delete(host.id); 
                interaction.channel.send("❌ حدث خطأ أثناء إنشاء ساحة المعركة (Thread). تأكد من صلاحيات البوت.");
            }

        } else {
            activeDungeonRequests.delete(host.id); 
            if (msg.editable) msg.edit({ content: "❌ تم إلغاء الدانجون (انتهى الوقت).", components: [], embeds: [] });
        }
    });
}

// ⚔️⚔️ تشغيل الدانجون ⚔️⚔️
async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId) {
    const guild = threadChannel.guild;
    
    let players = [];
    for (const id of partyIDs) {
        const m = await guild.members.fetch(id).catch(()=>null);
        if (m) players.push(getRealPlayerData(m, sql));
    }

    if (players.length === 0) {
        activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ في البيانات.");
    }

    for (let floor = 1; floor <= 10; floor++) {
        if (players.every(p => p.isDead)) break; 

        players.forEach(p => { if (!p.isDead) { p.shield = 0; p.effects = []; } });

        const floorConfig = dungeonConfig.floors.find(f => f.floor === floor) || dungeonConfig.floors[0];
        const randomMob = getRandomMonster(floorConfig.type, theme);
        const avgPlayerHp = players.reduce((sum, p) => sum + p.maxHp, 0) / players.length;
        
        let monster = {
            name: randomMob.name,
            hp: Math.floor(avgPlayerHp * floorConfig.hp_mult * (1 + (players.length * 0.2))),
            maxHp: Math.floor(avgPlayerHp * floorConfig.hp_mult * (1 + (players.length * 0.2))),
            atk: Math.floor(20 * floorConfig.atk_mult), 
            enraged: false,
            effects: [] 
        };

        let log = [`⚠️ **الطابق ${floor}**: ظهر **${monster.name}**! (HP: ${monster.maxHp})`];
        let ongoing = true;

        const battleMsg = await threadChannel.send({ 
            embeds: [generateBattleEmbed(players, monster, floor, theme, log)], 
            components: [generateBattleRow()] 
        });

        // حلقة المعركة
        while (ongoing) {
            const collector = battleMsg.createMessageComponentCollector({ time: 60000 });
            let actedPlayers = [];

            await new Promise(resolve => {
                // مؤقت تخطي الدور (AFK)
                const turnTimeout = setTimeout(() => { 
                    // تحديد من لم يهاجم
                    const afkPlayers = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                    const afkMentions = afkPlayers.map(p => `<@${p.id}>`).join(' ');
                    
                    let skipMsg = "⏰ **انتهى الوقت!** تم تخطي الدور تلقائياً.";
                    if (afkMentions) {
                        skipMsg += `\n😴 **النائمون:** ${afkMentions} (لم يهاجموا)`;
                    }

                    threadChannel.send(skipMsg);
                    collector.stop('turn_end'); 
                }, 45000); 

                collector.on('collect', async i => {
                    const p = players.find(pl => pl.id === i.user.id);
                    if (!p || p.isDead || actedPlayers.includes(p.id)) {
                        if (!i.replied) await i.reply({ content: "⏳ انتظر دورك/أنت ميت.", ephemeral: true });
                        return;
                    }

                    if (i.customId === 'skill') {
                        const skillRow = buildSkillSelector(p);
                        if (!skillRow) return i.reply({ content: "❌ لا توجد مهارات.", ephemeral: true });
                        const skillMsg = await i.reply({ content: "✨ **اختر المهارة:**", components: [skillRow], ephemeral: true, fetchReply: true });
                        try {
                            const selection = await skillMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id && subI.customId === 'skill_select_menu', time: 10000 });
                            const skillId = selection.values[0];
                            const skill = p.skills[skillId];
                            if ((p.skillCooldowns[skillId] || 0) > 0) return await selection.reply({ content: `⏳ كولداون (${p.skillCooldowns[skillId]}).`, ephemeral: true });
                            actedPlayers.push(p.id);
                            handleSkillUsage(p, skill, monster, log);
                            p.skillCooldowns[skillId] = 3; 
                            await selection.update({ content: `✅ تم: ${skill.name}`, components: [] });
                            if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimeout); collector.stop('turn_end'); }
                        } catch (err) { await i.editReply({ content: "⏰ انتهى الوقت.", components: [] }); }
                        return;
                    }

                    actedPlayers.push(p.id);
                    await i.deferUpdate();

                    let atkMultiplier = 1.0;
                    p.effects.forEach(e => { if(e.type === 'atk_buff') atkMultiplier += e.val; });
                    const currentAtk = Math.floor(p.atk * atkMultiplier);

                    if (i.customId === 'atk') {
                        const isCrit = Math.random() < 0.2;
                        let dmg = Math.floor(currentAtk * (0.9 + Math.random() * 0.2));
                        if (isCrit) dmg = Math.floor(dmg * 1.5);
                        monster.hp -= dmg;
                        p.totalDamage += dmg; 
                        log.push(`🗡️ **${p.name}** ${isCrit ? '**CRIT!**' : ''} سبب ${dmg} ضرر.`);
                    } else if (i.customId === 'heal') {
                        if (p.potions > 0) {
                            p.hp = Math.min(p.hp + Math.floor(p.maxHp * 0.35), p.maxHp);
                            p.potions--;
                            log.push(`🧪 **${p.name}** تعالج.`);
                        }
                    } else if (i.customId === 'def') {
                        p.defending = true;
                        p.shield += Math.floor(p.maxHp * 0.1);
                        log.push(`🛡️ **${p.name}** يدافع.`);
                    }

                    if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimeout); collector.stop('turn_end'); }
                });

                collector.on('end', () => {
                    clearTimeout(turnTimeout);
                    resolve();
                });
            });

            // نهاية الجولة
            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                p.effects = p.effects.filter(e => { e.turns--; return e.turns > 0; });
            });

            if (monster.effects.length > 0) {
                monster.effects = monster.effects.filter(e => {
                    if (e.type === 'poison') {
                        monster.hp -= e.val;
                        log.push(`☠️ **${monster.name}** يتألم من السم (-${e.val}).`);
                    }
                    e.turns--;
                    return e.turns > 0;
                });
            }

            // موت الوحش (فوز بالطابق)
            if (monster.hp <= 0) {
                ongoing = false;
                await battleMsg.edit({ components: [] });

                const hostData = sql.prepare("SELECT dungeon_gate_level FROM levels WHERE user = ? AND guild = ?").get(hostId, guild.id);
                const gateLevel = hostData?.dungeon_gate_level || 1;
                const bonusMultiplier = 1 + ((gateLevel - 1) * 0.1);
                
                let floorXp = Math.floor(floorConfig.xp * bonusMultiplier);
                let floorMora = Math.floor(floorConfig.mora * bonusMultiplier);

                // ✅ 3. تطبيق شرط التقسيم (طابق 5 وما فوق)
                if (floor >= 5) {
                    floorXp = Math.floor(floorXp / players.length);
                    floorMora = Math.floor(floorMora / players.length);
                }
                
                // --- توزيع الغنائم الفردية (الأحياء فقط) ---
                players.forEach(p => {
                    if (!p.isDead) {
                        // الحي يحصل على الجائزة في رصيده المؤقت
                        p.loot.mora += floorMora;
                        p.loot.xp += floorXp;
                    }
                    // الميت لا يتم إضافة شيء له (توقف رصيده عند موته)
                });

                if (floor === 10) {
                    await sendEndMessage(mainChannel, threadChannel, players, floor, "win", sql, guild.id, hostId);
                    return; 
                }

                const decisionEmbed = new EmbedBuilder()
                    .setTitle(`🎉 انتصار في الطابق ${floor}!`)
                    .setDescription(`الجوائز المكتسبة: ${floorMora} ${EMOJI_MORA} | ${floorXp} XP\n(تمت إضافتها لمحفظة الفريق)`)
                    .setColor(Colors.Green);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dungeon_continue').setLabel('استمرار').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('dungeon_retreat').setLabel('انسحاب').setStyle(ButtonStyle.Danger)
                );

                const dMsg = await threadChannel.send({ embeds: [decisionEmbed], components: [row] });
                
                try {
                    const i = await dMsg.awaitMessageComponent({ filter: idx => idx.user.id === hostId, time: 60000 });
                    if (i.customId === 'dungeon_retreat') {
                        await i.update({ components: [] });
                        await sendEndMessage(mainChannel, threadChannel, players, floor, "retreat", sql, guild.id, hostId);
                        return;
                    }
                    await i.update({ content: "⚔️ **نحو الطابق التالي...**", components: [], embeds: [] });
                    players.forEach(p => { if(!p.isDead) p.hp = Math.min(p.hp + 20, p.maxHp); });
                } catch (e) {
                    await sendEndMessage(mainChannel, threadChannel, players, floor, "retreat", sql, guild.id, hostId);
                    return;
                }
            } else {
                // هجوم الوحش
                const alivePlayers = players.filter(p => !p.isDead);
                if (alivePlayers.length > 0) {
                    const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                    let dmg = monster.atk;
                    if (target.defending) dmg = Math.floor(dmg * 0.5);
                    if (target.shield > 0) {
                        if (dmg > target.shield) { dmg -= target.shield; target.shield = 0; }
                        else { target.shield -= dmg; dmg = 0; }
                    }
                    target.hp -= dmg;
                    log.push(`👹 **${monster.name}** هاجم **${target.name}** (${dmg} ضرر)`);
                    if (target.hp <= 0) { target.hp = 0; target.isDead = true; log.push(`💀 **${target.name}** سقط!`); }
                }

                // خسارة الفريق
                if (players.every(p => p.isDead)) {
                    ongoing = false;
                    await battleMsg.edit({ components: [] });
                    await sendEndMessage(mainChannel, threadChannel, players, floor, "lose", sql, guild.id, hostId);
                    return;
                }

                players.forEach(p => p.defending = false);
                if (log.length > 5) log = log.slice(-5);
                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log)] });
            }
        }
    }
}

// دالة إرسال النتيجة النهائية وحذف الثريد
async function sendEndMessage(mainChannel, thread, players, floor, status, sql, guildId, hostId) {
    let extraLootMsg = "";

    // ✅ منطق توزيع الجوائز أو الخسارة
    players.forEach(p => {
        const expire = Date.now() + (15 * 60 * 1000); // 15 دقيقة

        if (status === 'win' || status === 'retreat') {
            
            // حساب الجائزة النهائية
            let finalMora = p.loot.mora;
            let finalXp = p.loot.xp;

            // عقوبة الموت: 50% من المكتسبات
            if (p.isDead) {
                finalMora = Math.floor(finalMora * 0.5);
                finalXp = Math.floor(finalXp * 0.5);
            }

            // إضافة الجوائز للداتابيس
            if (finalMora > 0 || finalXp > 0) {
                sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(finalXp, finalMora, p.id, guildId);
            }
            
            // إضافة بافات (تعزيز) عند الفوز الكامل فقط
            if (status === 'win') {
                // باف +15% XP و Mora
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, 15, expire, 'xp', 0.15);
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, 15, expire, 'mora', 0.15);
            }

            // تحديث قيمة العرض في الـ Embed
            p.loot.mora = finalMora;
            p.loot.xp = finalXp;

        } else if (status === 'lose') {
            // ✅ 4. عقوبة الخسارة (النيرف - Debuff)
            // نيرف XP (-15%)
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expire, 'xp', -0.15);
            // نيرف Mora (-15%)
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expire, 'mora', -0.15);
        }
    });

    // ✅ 5. احتمالية سقوط مواد تعزيز عند الفوز
    if (status === 'win') {
        const dropChance = 0.3 + (floor * 0.05); 
        if (Math.random() < dropChance) {
            extraLootMsg = "\n💎 **غنائم إضافية:** حصل الفريق على **حجر تعزيز**!";
        }
    }

    // إزالة القائد من قائمة النشطين
    activeDungeonRequests.delete(hostId);

    // حساب MVP
    let mvpPlayer = null;
    let maxDamage = -1;

    players.forEach(p => {
        if (p.totalDamage > maxDamage) {
            maxDamage = p.totalDamage;
            mvpPlayer = p;
        }
    });

    const embed = new EmbedBuilder()
        .setTitle(status === 'win' ? "🏆 نـصـر أسـطـوري!" : (status === 'lose' ? "☠️ هـزيمـة سـاحقـة" : "🏳️ انـسحـاب تـكـتـيـكـي"))
        .setColor(status === 'win' ? Colors.Gold : (status === 'lose' ? Colors.DarkRed : Colors.Orange))
        .setImage(status === 'win' ? WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)] : LOSE_IMAGES[Math.floor(Math.random() * LOSE_IMAGES.length)])
        .setFooter({ text: `وصلتم للطابق: ${floor}` });

    let desc = `**تقرير المعركة النهائي:**\n\n`;

    if (mvpPlayer && mvpPlayer.totalDamage > 0) {
        desc += `👑 **نجم المعركة (MVP):** ${mvpPlayer.name}\n💥 **إجمالي الضرر:** ${mvpPlayer.totalDamage.toLocaleString()}\n━━━━━━━━━━━━━━━━━━━━\n`;
    }

    if (status === 'lose') {
        desc += `💀 **لعنة الهزيمة:** أصيب الفريق بالوهن!\n🔻 **-15%** كسب XP و Mora لمدة 15 دقيقة.\n\n`;
    } else {
        if (status === 'win') desc += `🆙 **مكافأة النصر:** +15% كسب XP و Mora لمدة 15 دقيقة!\n`;
        if (extraLootMsg) desc += `${extraLootMsg}\n`;
        desc += `\n**توزيع الغنائم:**\n`;
    }
    
    players.forEach(p => {
        let lootText = "";
        if (status !== 'lose') {
            if (p.isDead) {
                lootText = ` (💀 ميت: ${p.loot.mora} ${EMOJI_MORA} | ${p.loot.xp} XP) *نصف المكافأة*`;
            } else {
                lootText = ` (💰 ${p.loot.mora} ${EMOJI_MORA} | ✨ ${p.loot.xp} XP)`;
            }
        }
        
        desc += `${p.isDead ? '💀' : '💚'} **${p.name}** - ${p.hp}/${p.maxHp} HP${lootText}\n`;
    });

    embed.setDescription(desc);

    await mainChannel.send({ content: `📢 **انتهت معركة الدانجون!**`, embeds: [embed] });

    setTimeout(() => {
        thread.delete().catch(e => console.log("Could not delete thread:", e));
    }, 5000); 
}

function generateBattleEmbed(players, monster, floor, theme, log, color = '#2F3136') {
    const embed = new EmbedBuilder()
        .setTitle(`${theme.emoji} الطابق ${floor} | ضد ${monster.name}`)
        .setColor(color);

    let monsterStatus = "";
    if (monster.effects.some(e => e.type === 'poison')) monsterStatus += " ☠️";
    if (monster.effects.some(e => e.type === 'weakness')) monsterStatus += " 📉";

    const monsterBar = buildHpBar(monster.hp, monster.maxHp);
    embed.addFields({ 
        name: `👹 **${monster.name}** ${monsterStatus}`, 
        value: `${monsterBar} \`[${monster.hp}/${monster.maxHp}]\``, 
        inline: false 
    });

    let teamStatus = players.map(p => {
        const icon = p.isDead ? '💀' : (p.defending ? '🛡️' : '❤️');
        const hpBar = p.isDead ? 'MORT' : buildHpBar(p.hp, p.maxHp, p.shield);
        return `${icon} **${p.name}**\n${hpBar}`;
    }).join('\n\n');

    embed.addFields({ name: `🛡️ **فريق المغامرين**`, value: teamStatus, inline: false  });

    if (log.length > 0) {
        embed.addFields({ name: "📝 سجل المعركة:", value: log.join('\n'), inline: false });
    }

    return embed;
}

function generateBattleRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('atk').setLabel('هجوم').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('skill').setLabel('مهارات').setEmoji('✨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('heal').setLabel('جرعة').setEmoji('🧪').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('def').setLabel('دفاع').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
    );
}

module.exports = { startDungeon };
