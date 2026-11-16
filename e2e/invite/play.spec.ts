import { expect, test } from "@playwright/test";
import { admin, enterWithLink, scrollTo, seedEvent, shot } from "./helpers";

const L = (ar: string, en: string) => ({ ar, en });

test("a joined guest answers a vote and a quiz, and posts a wish", async ({ page }) => {
  const event = await seedEvent("wedding");
  const { data: games, error } = await admin
    .from("games")
    .insert([
      {
        event_id: event.id,
        kind: "vote",
        state: "open",
        position: 0,
        config: {
          title: L("مين فيهم؟", "Who's more likely?"),
          mode: "this_or_that",
          showTally: "after_vote",
          minTallyVotes: 1,
          questions: [{ id: "late", prompt: L("مين بيتأخر دايماً؟", "Who's always late?"), options: [{ id: "him", label: L("هو", "Him") }, { id: "her", label: L("هي", "Her") }] }],
        },
      },
      {
        event_id: event.id,
        kind: "quiz",
        state: "open",
        position: 1,
        config: {
          title: L("مين عارف العرسان؟", "Who knows the couple?"),
          timed: true,
          secondsPerQuestion: 20,
          questions: [
            { id: "met", prompt: L("اتقابلوا فين؟", "Where did they meet?"), options: [{ id: "uni", label: L("الجامعة", "University") }, { id: "work", label: L("الشغل", "Work") }] },
          ],
        },
      },
    ])
    .select("id, kind");
  expect(error).toBeNull();
  const quiz = games!.find((game) => game.kind === "quiz")!;
  await admin.from("game_secrets").insert({ game_id: quiz.id, truth: { answers: { met: "uni" } } });

  await enterWithLink(page, event, event.codes.group);
  await expect(page.getByTestId("games")).toBeVisible();
  await scrollTo(page, "#play");
  await page.getByLabel("اسمك").fill("سلمى");
  await page.getByTestId("team-friends").click();
  await page.getByRole("button", { name: "انضم", exact: true }).click();
  await page.getByRole("button", { name: "حفظته" }).click();

  // Vote: the tally appears only after voting.
  const vote = page.getByTestId("game-vote");
  await scrollTo(page, '[data-testid="game-vote"]');
  await expect(vote.getByTestId("tally")).toHaveCount(0);
  await vote.locator("label", { hasText: /^هي$/ }).click();
  await expect(vote.getByRole("status")).toContainText("إجابتك اتسجلت");
  await expect(vote.getByTestId("tally")).toContainText("1");
  await page.screenshot({ path: shot("game-vote-ar") });

  // Quiz: served one question at a time, scored by the server.
  const quizCard = page.getByTestId("game-quiz");
  await scrollTo(page, '[data-testid="game-quiz"]');
  await quizCard.getByRole("button", { name: "ابدأ" }).click();
  await expect(quizCard).toContainText("اتقابلوا فين؟");
  await page.screenshot({ path: shot("game-quiz-ar") });
  await quizCard.locator("label", { hasText: "الجامعة" }).click();
  await expect(quizCard.getByRole("status")).toContainText("خلصت!");

  const { data: answers } = await admin.from("game_answers").select("question_id, score").eq("event_id", event.id);
  expect(answers?.map((a) => a.question_id).sort()).toEqual(["late", "met"]);
  expect(answers?.find((a) => a.question_id === "met")?.score).toBeGreaterThanOrEqual(10);

  // Wish: appears on the wall straight away for an invited guest.
  await scrollTo(page, "#wall");
  await page.getByTestId("wall").getByRole("textbox").fill("ألف مبروك يا حبايب");
  await page.getByTestId("wall").getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByTestId("wish").first()).toContainText("ألف مبروك يا حبايب");
  await page.screenshot({ path: shot("wall-ar") });
  const { data: posts } = await admin.from("wall_posts").select("body, status").eq("event_id", event.id);
  expect(posts).toHaveLength(1);

  // Survives a reload, answers stay locked.
  await page.reload();
  await expect(page.getByTestId("wish").first()).toContainText("ألف مبروك");
  await expect(page.getByTestId("game-vote").locator("input").first()).toBeDisabled();
});

test("gender reveal: a guest reads a clue and switches side once", async ({ page }) => {
  const event = await seedEvent("gender_reveal");
  await admin.from("games").insert({
    event_id: event.id,
    kind: "clues",
    state: "open",
    config: { title: L("العلامات", "The signs"), clues: [{ id: "salty", text: L("ماما نفسها في حادق", "Mum craves salty food"), hint: L("يعني ولد", "Means a boy") }] },
  });
  await enterWithLink(page, event, event.codes.group);
  await scrollTo(page, "#play");
  await page.getByLabel("اسمك").fill("نور");
  await page.getByTestId("team-girl").click();
  await page.getByRole("button", { name: "انضم", exact: true }).click();
  await page.getByRole("button", { name: "حفظته" }).click();
  await expect(page.getByTestId("badge")).toContainText("تيم بنت");

  await scrollTo(page, '[data-testid="game-clues"]');
  await page.getByTestId("game-clues").locator("summary").click();
  await page.getByTestId("switch-boy").click();
  await expect(page.getByTestId("badge")).toContainText("تيم ولد");
  await expect(page.getByTestId("switch-girl")).toHaveCount(0);
  await page.screenshot({ path: shot("game-clues-ar") });
});
