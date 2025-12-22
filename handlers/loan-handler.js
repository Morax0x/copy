const { EmbedBuilder, Colors } = require("discord.js");
const farmAnimals = require('../json/farm-animals.json');

async function checkLoanPayments(client, sql) {
    if (!sql.open) return;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // جلب القروض المستحقة (التي مر عليها يوم منذ آخر دفع)
    const activeLoans = sql.prepare("SELECT * FROM user_loans WHERE remainingAmount > 0 AND (lastPaymentDate + ?) <= ?").all(ONE_DAY, now);

    if (activeLoans.length === 0) return;

    // --- تجهيز الأوامر خارج الـ Loop لتحسين الأداء (مهم جداً) ---
    const stmtGetPortfolio = sql.prepare("SELECT * FROM user_portfolio WHERE userID = ? AND guildID = ?");
    const stmtGetMarketItem = sql.prepare("SELECT currentPrice, name FROM market_items WHERE id = ?");
    const stmtDeletePortfolio = sql.prepare("DELETE FROM user_portfolio WHERE id = ?");
    const stmtUpdatePortfolio = sql.prepare("UPDATE user_portfolio SET quantity = quantity - ? WHERE id = ?");
    
    const stmtGetFarm = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ?");
    const stmtDeleteFarm = sql.prepare("DELETE FROM user_farm WHERE id = ?");
    
    const stmtDeleteLoan = sql.prepare("DELETE FROM user_loans WHERE userID = ? AND guildID = ?");
    const stmtUpdateLoan = sql.prepare("UPDATE user_loans SET remainingAmount = ?, lastPaymentDate = ? WHERE userID = ? AND guildID = ?");
    const stmtGetSettings = sql.prepare("SELECT casinoChannelID FROM settings WHERE guild = ?");

    // -----------------------------------------------------------

    for (const loan of activeLoans) {
        try {
            const guild = client.guilds.cache.get(loan.guildID);
            if (!guild) continue;

            // جلب بيانات المستخدم
            let userData = client.getLevel.get(loan.userID, loan.guildID);
            if (!userData) continue; // تخطي إذا لم يكن لديه ملف

            // جلب العضو (قد يفشل إذا خرج من السيرفر، لذلك نكمل الكود حتى لو لم نجد العضو لخصم الديون)
            const member = await guild.members.fetch(loan.userID).catch(() => null);

            // المبلغ المطلوب سداده اليوم (القسط أو المتبقي أيهما أقل)
            const paymentAmount = Math.min(loan.dailyPayment, loan.remainingAmount);
            let remainingToPay = paymentAmount; // هذا المتغير سينقص كلما خصمنا شيئاً
            let deductionDetails = ""; 
            
            const EMOJI_MORA = client.EMOJI_MORA || '🪙'; 

            // =================================================
            // 1. الخصم من الكاش (Mora)
            // =================================================
            if (userData.mora > 0) {
                const takeMora = Math.min(userData.mora, remainingToPay);
                userData.mora -= takeMora;
                remainingToPay -= takeMora;
                
                if (takeMora > 0) {
                    deductionDetails += `💸 **خصم مورا:** تم استقطاع **${takeMora.toLocaleString()}** ${EMOJI_MORA}\n`;
                }
            }

            // =================================================
            // 2. الخصم من البنك (Bank) - (تمت الإضافة هنا)
            // =================================================
            if (remainingToPay > 0 && userData.bank > 0) {
                const takeBank = Math.min(userData.bank, remainingToPay);
                userData.bank -= takeBank;
                remainingToPay -= takeBank;

                if (takeBank > 0) {
                     deductionDetails += `💳 **خصم بنكي:** تم سحب **${takeBank.toLocaleString()}** ${EMOJI_MORA}\n`;
                }
            }

            // =================================================
            // 3. تسييل أصول السوق (Stocks)
            // =================================================
            if (remainingToPay > 0) {
                 const portfolio = stmtGetPortfolio.all(loan.userID, loan.guildID);
                 
                 for (const item of portfolio) {
                     if (remainingToPay <= 0) break; // توقف فوراً إذا تم السداد

                     const marketData = stmtGetMarketItem.get(item.itemID);
                     if (!marketData) continue; // السهم محذوف من السوق

                     const price = marketData.currentPrice;
                     // كم نحتاج نبيع؟ (سقف المبلغ المتبقي / السعر)
                     const neededQty = Math.ceil(remainingToPay / price);
                     const sellQty = Math.min(item.quantity, neededQty);
                     const value = sellQty * price;
                     
                     // تحديث المحفظة
                     if (sellQty >= item.quantity) {
                         stmtDeletePortfolio.run(item.id);
                     } else {
                         stmtUpdatePortfolio.run(sellQty, item.id);
                     }
                     
                     // خصم المبلغ وحساب الفائض
                     if (value > remainingToPay) {
                         const change = value - remainingToPay;
                         userData.mora += change; // إرجاع الباقي للمستخدم كاش
                         remainingToPay = 0;
                     } else {
                         remainingToPay -= value;
                     }

                     deductionDetails += `📉 **تسييل أصول:** تم بيع **${sellQty}x ${marketData.name}**\n`;
                 }
            }

            // =================================================
            // 4. بيع حيوانات المزرعة (Farm)
            // =================================================
            if (remainingToPay > 0) {
                 const farm = stmtGetFarm.all(loan.userID, loan.guildID);
                 
                 for (const animalRow of farm) {
                     if (remainingToPay <= 0) break;

                     const animalData = farmAnimals.find(a => a.id === animalRow.animalID);
                     if (!animalData) continue;

                     // سعر البيع (عادة يكون نصف السعر الأصلي أو السعر كاملاً حسب رغبتك، هنا وضعت السعر الأصلي)
                     const price = animalData.price; 
                     
                     // حذف الحيوان
                     stmtDeleteFarm.run(animalRow.id);

                     if (price > remainingToPay) {
                         const change = price - remainingToPay;
                         userData.mora += change;
                         remainingToPay = 0;
                     } else {
                         remainingToPay -= price;
                     }

                     deductionDetails += `🚜 **بيع مزرعة:** تم مصادرة **${animalData.name}**\n`;
                 }
            }

            // =================================================
            // 5. عقوبة الخبرة (XP Penalty) - الملاذ الأخير
            // =================================================
            if (remainingToPay > 0) {
                // العقوبة: ضعف المبلغ المتبقي يخصم من الـ XP
                const xpPenalty = Math.floor(remainingToPay * 2);
                
                if (userData.xp >= xpPenalty) {
                    userData.xp -= xpPenalty; 
                } else { 
                    userData.xp = 0; 
                    if (userData.level > 1) userData.level -= 1; // تخفيض لفل
                }
                
                deductionDetails += `⚠️ **عقوبة تعثر:** تم خصم **${xpPenalty.toLocaleString()}** XP لعدم كفاية الأصول\n`;
                // نعتبر أنه تم "السداد" عبر العقوبة لكي ينقص القرض ولا يتراكم
                remainingToPay = 0; 
            }

            // حفظ التغييرات على المستخدم
            client.setLevel.run(userData);
            
            // تحديث القرض في الداتابيس
            // ملاحظة: نقوم بخصم القسط كاملاً لأننا إما أخذنا مالاً أو أصولاً أو فرضنا عقوبة بديلة
            loan.remainingAmount -= paymentAmount; 
            
            // التأكد من عدم نزول القرض تحت الصفر (حالة نادرة جداً)
            if (loan.remainingAmount < 0) loan.remainingAmount = 0;

            if (loan.remainingAmount <= 0) {
                stmtDeleteLoan.run(loan.userID, loan.guildID);
                deductionDetails += `\n🎉 **تم سداد القرض بالكامل!**`;
            } else {
                stmtUpdateLoan.run(loan.remainingAmount, now, loan.userID, loan.guildID);
            }

            // =================================================
            // إرسال الإشعار
            // =================================================
            if (!member) continue; // إذا العضو غير موجود بالسيرفر لا نرسل رسالة

            const settings = stmtGetSettings.get(guild.id);
            if (settings && settings.casinoChannelID) {
                const channel = guild.channels.cache.get(settings.casinoChannelID);
                if (channel && deductionDetails) {
                    
                    const daysLeft = Math.ceil(loan.remainingAmount / loan.dailyPayment);

                    const embed = new EmbedBuilder()
                        .setTitle(`❖ إشـعـار سـداد القـرض`)
                        .setColor(remainingToPay > 0 ? Colors.Red : Colors.Gold) // أحمر لو فيه مشكلة، ذهبي لو تمام
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                        .setImage('https://i.postimg.cc/vmrBxCqF/download-(1).gif')
                        .setDescription(
                            `**📊 موقف القرض:**\n` +
                            `• المبلغ المستقطع: **${paymentAmount.toLocaleString()}** ${EMOJI_MORA}\n` +
                            `• المتبقي من الدين: **${loan.remainingAmount.toLocaleString()}** ${EMOJI_MORA}\n` +
                            `• الأقساط المتبقية: **${daysLeft}** يوم تقريباً\n\n` +
                            `**🧾 تفاصيل العملية:**\n${deductionDetails}`
                        )
                        .setFooter({ text: "يتم الخصم تلقائياً كل 24 ساعة" })
                        .setTimestamp();

                    await channel.send({ content: `<@${loan.userID}>`, embeds: [embed] }).catch(() => {});
                    
                    // تأخير بسيط 1 ثانية لتجنب الباند من ديسكورد اذا العدد كبير
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

        } catch (err) {
            console.error(`[Loan Error] User: ${loan.userID}`, err);
        }
    }
}

module.exports = { checkLoanPayments };
