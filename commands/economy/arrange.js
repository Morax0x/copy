const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const path = require('path');

let streakHandler;
try {
    streakHandler = require('../../streak-handler.js');
} catch (e) {}

let updateGuildStat;
try {
    // 🔥 التعديل هنا: جلب الدالة من ملف اللوحة بدلاً من التراكر المحذوف 🔥
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const activePlayers = new Set();
const cooldowns = new Map();

const OWNER_ID = "1145327691772481577";

const MIN_BET = 10;
const MAX_BET = 100;

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('arrange')
        .setDescription('لعبة ترتيب الأرقام')
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription('مبلغ الرهان (بين 10 و 100)')
                .setRequired(false)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
        ),

    name: 'arrange',
    aliases: ['رتب', 'ترتيب'],
    category: "Economy",
    description: 'لعبـة ترتيــب الأرقــام',
    
    async execute(interactionOrMessage, args) {
        
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, guild, channel, betArg;

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            guild = interaction.guild;
            channel = interaction.channel;
            betArg = interaction.options.getInteger('amount');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            user = message.author;
            guild = message.guild;
            channel = message.channel;
            betArg = args[0] ? parseInt(args[0]) : null;
        }

        const userId = user.id;
        const guildId = guild.id;
        
        const replyError = async (content) => {
            const payload = { content: content };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        const client = isSlash ? interaction.client : message.client;
        if (!client.sql) return replyError("❌ خطأ: قاعدة البيانات غير متصلة.");
        
        const db = client.sql; 
        const MORA_EMOJI = client.EMOJI_MORA || '<:mora:1435647151349698621>';

        const clearActive = () => activePlayers.delete(userId);

        if (activePlayers.has(userId)) {
            return replyError("🚫 **لديك عملية نشطة بالفعل!** أكمل اللعبة أو الرهان الحالي أولاً.");
        }

        if (userId !== OWNER_ID) {
            if (cooldowns.has(userId)) {
                const expirationTime = cooldowns.get(userId) + 3600000;
                if (Date.now() < expirationTime) {
                    const timeLeft = (expirationTime - Date.now()) / 1000 / 60;
                    return replyError(`<:stop:1436337453098340442> **ريــلاكــس!** يمكنك اللعب مجدداً بعد **${timeLeft.toFixed(0)} دقيقة**.`);
                }
            }
        }

        activePlayers.add(userId);

        const startGame = async (finalBetAmount) => {
            try {
                const userCheck = db.prepare('SELECT mora FROM levels WHERE user = ? AND guild = ?').get(userId, guildId);
                
                if (userCheck && userCheck.mora < finalBetAmount && !betArg) {
                     finalBetAmount = userCheck.mora;
                }

                if (!userCheck || userCheck.mora < finalBetAmount) {
                      clearActive(); 
                      return replyError(`💸 **رصيدك غير كافــي!** <:mirkk:1435648219488190525>`);
                }
                
                if (finalBetAmount < MIN_BET) {
                    clearActive();
                    return replyError(`❌ **الحد الأدنى للرهان هو ${MIN_BET} ${MORA_EMOJI}**`);
                }

                db.prepare('UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?').run(finalBetAmount, userId, guildId);

                if (userId !== OWNER_ID) cooldowns.set(userId, Date.now());
                
                try {
                    db.prepare("UPDATE levels SET lastArrange = ? WHERE user = ? AND guild = ?").run(Date.now(), userId, guildId);
                } catch (e) {}

                const numbersCount = 9;
                const randomNumbers = new Set();
                while (randomNumbers.size < numbersCount) {
                    randomNumbers.add(getRandomInt(1, 99));
                }
                const numbersArray = Array.from(randomNumbers);
                const sortedSolution = [...numbersArray].sort((a, b) => a - b);
                
                const buttonMap = {}; 
                const buttons = numbersArray.map(num => {
                    const btn = new ButtonBuilder()
                        .setCustomId(`num_${num}`)
                        .setLabel(`${num}`)
                        .setStyle(ButtonStyle.Secondary);
                    buttonMap[`num_${num}`] = btn;
                    return btn;
                });

                const shuffledButtons = buttons.sort(() => Math.random() - 0.5);
                const row1 = new ActionRowBuilder().addComponents(shuffledButtons.slice(0, 3));
                const row2 = new ActionRowBuilder().addComponents(shuffledButtons.slice(3, 6));
                const row3 = new ActionRowBuilder().addComponents(shuffledButtons.slice(6, 9));
                const allRows = [row1, row2, row3];

                const gameEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setThumbnail(user.displayAvatarURL())
                    .setTitle('❖ رتـب الأرقـام مـن الأصغر للأكـبر')
                    .setDescription(`❖ الرهــان: **${finalBetAmount} ${MORA_EMOJI}**\nاضغط الأزرار بالترتيب الصحيح قبل انتهاء الوقت!`)
                    .setFooter({ text: '❖ لــديــك 25 ثـانيــة' });

                const gameMsg = isSlash 
                    ? await interaction.editReply({ content: '', embeds: [gameEmbed], components: allRows })
                    : await message.channel.send({ embeds: [gameEmbed], components: allRows });

                const startTime = Date.now();
                const collector = gameMsg.createMessageComponentCollector({ 
                    componentType: ComponentType.Button, 
                    time: 25000 
                });

                let currentStep = 0; 

                const finishGame = async (i, reason) => {
                    clearActive(); 
                    try {
                        if (reason === 'win') {
                            const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
                            
                            let moraMultiplier = 1.0;
                            const memberObj = isSlash ? interaction.member : message.member;
                            
                            if (streakHandler && streakHandler.calculateMoraBuff) {
                                moraMultiplier = streakHandler.calculateMoraBuff(memberObj, db);
                            }
                            
                            let profit = Math.floor(finalBetAmount * 3.0 * moraMultiplier); 
                            
                            let casinoTax = 0;
                            let taxText = "";

                            const settings = db.prepare("SELECT roleCasinoKing FROM settings WHERE guild = ?").get(guildId);
                            if (settings && settings.roleCasinoKing && !memberObj.roles.cache.has(settings.roleCasinoKing)) {
                                const kingMembers = guild.roles.cache.get(settings.roleCasinoKing)?.members;
                                if (kingMembers && kingMembers.size > 0) {
                                    const king = kingMembers.first();
                                    casinoTax = Math.floor(profit * 0.01);
                                    if (casinoTax > 0) {
                                        profit -= casinoTax;
                                        taxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                                        db.prepare('UPDATE levels SET bank = bank + ? WHERE user = ? AND guild = ?').run(casinoTax, king.id, guildId);
                                    }
                                }
                            }

                            const totalPrize = finalBetAmount + profit; 
                            
                            const buffOnlyPercent = Math.round((moraMultiplier - 1) * 100);
                            let buffText = "";
                            if (buffOnlyPercent > 0) buffText = ` (+${buffOnlyPercent}%)`; 

                            db.prepare('UPDATE levels SET mora = mora + ? WHERE user = ? AND guild = ?').run(totalPrize, userId, guildId);

                            if (updateGuildStat) {
                                updateGuildStat(client, guildId, userId, 'casino_profit', profit);
                            }

                            const winEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setThumbnail(user.displayAvatarURL())
                                .setTitle('❖ كفــوو عليك <:2BCrikka:1437806481071411391>')
                                .setDescription(`✶ جبتها صــح!\n⏱️ الوقت: **${timeTaken}ث**\n💰 ربـحـت: **${profit}** ${MORA_EMOJI}${buffText}${taxText}`);

                            Object.values(buttonMap).forEach(btn => {
                                btn.setDisabled(true);
                                if (btn.data.style === ButtonStyle.Secondary) btn.setStyle(ButtonStyle.Success);
                            });
                            
                            const payload = { embeds: [winEmbed], components: allRows };
                            if (i) await i.editReply(payload);
                            else await gameMsg.edit(payload);

                        } else if (reason === 'lose') {
                            const loseEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setThumbnail(user.displayAvatarURL())
                                .setTitle(' خـسـرت <:catla:1437335118153781360>!')
                                .setDescription(`ضغطت رقم غلط!\nراحت عليك **${finalBetAmount} ${MORA_EMOJI}**`);

                            Object.values(buttonMap).forEach(btn => {
                                btn.setDisabled(true);
                                if (btn.data.style === ButtonStyle.Secondary) btn.setStyle(ButtonStyle.Secondary); 
                            });
                            
                            const payload = { embeds: [loseEmbed], components: allRows };
                            if (i) await i.editReply(payload);
                            else await gameMsg.edit(payload);

                        } else if (reason === 'time') {
                            const loseEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setThumbnail(user.displayAvatarURL())
                                .setTitle(' خـسـرت <:catla:1437335118153781360>!')
                                .setDescription(`انتهى الوقت!\nراحت عليك **${finalBetAmount} ${MORA_EMOJI}**`);

                            Object.values(buttonMap).forEach(btn => btn.setDisabled(true));
                            await gameMsg.edit({ embeds: [loseEmbed], components: allRows }).catch(() => {});
                        }
                    } catch (err) { console.error("Game finish error:", err); }
                };

                collector.on('collect', async i => {
                    if (i.user.id !== userId) return i.reply({ content: 'هذه اللعبة ليست لك!', flags: [MessageFlags.Ephemeral] });

                    const deferPromise = i.deferUpdate(); 

                    const clickedNum = parseInt(i.customId.split('_')[1]);
                    const correctNum = sortedSolution[currentStep];

                    if (clickedNum === correctNum) {
                        currentStep++;
                        buttonMap[i.customId].setStyle(ButtonStyle.Success).setDisabled(true);

                        if (currentStep === sortedSolution.length) {
                            collector.stop('finished');
                            await deferPromise;
                            await finishGame(i, 'win');
                        } else {
                            await deferPromise;
                            await i.editReply({ components: allRows });
                        }
                    } else {
                        buttonMap[i.customId].setStyle(ButtonStyle.Danger);
                        collector.stop('finished');
                        await deferPromise;
                        await finishGame(i, 'lose');
                    }
                });

                collector.on('end', async (collected, reason) => {
                    if (reason === 'time') {
                        await finishGame(null, 'time');
                    } else if (reason !== 'finished') {
                        clearActive();
                    }
                });

            } catch (err) {
                clearActive();
                console.error("خطأ أثناء بدء اللعبة:", err);
                replyError("حدث خطأ أثناء بدء اللعبة.");
            }
        };

        if (betArg && isNaN(betArg)) {
             clearActive();
             return replyError("❌ **الرجاء إدخال مبلغ رهان صحيح (أرقام فقط).**");
        }

        let finalBetAmount = betArg;

        if (finalBetAmount) {
            if (finalBetAmount < MIN_BET) {
                clearActive(); return replyError(`❌ **الحد الأدنى للرهان هو ${MIN_BET} ${MORA_EMOJI}**`);
            }
            if (finalBetAmount > MAX_BET) {
                clearActive(); return replyError(`❌ **الحد الأقصى للرهان هو ${MAX_BET} ${MORA_EMOJI}**`);
            }
            return startGame(finalBetAmount);
        }

        let userData = db.prepare('SELECT mora FROM levels WHERE user = ? AND guild = ?').get(userId, guildId);
        
        if (!userData || userData.mora < MIN_BET) {
            clearActive();
            return replyError(`💸 **ليس لديك مورا كافية للعب! (الحد الأدنى ${MIN_BET})** <:catla:1437335118153781360>`);
        }

        let proposedBet = 100;
        if (userData.mora < 100) proposedBet = userData.mora;

        return startGame(proposedBet);
    }
};
