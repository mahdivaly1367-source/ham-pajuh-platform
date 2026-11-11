import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const password = "CI-HamPajuh-Password-2026";

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return values
    .filter(Boolean)
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function request(path, options = {}) {
  return fetch(new URL(path, baseUrl), {
    ...options,
    headers: {
      origin: baseUrl,
      ...(options.headers ?? {})
    }
  });
}

async function register(label) {
  const response = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: label,
      email: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID()}@example.test`,
      password,
      callbackURL: "/"
    })
  });

  const body = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    200,
    `Sign-up should return HTTP 200; got ${response.status}: ${JSON.stringify(body)}`
  );

  const cookie = cookieFrom(response);
  assert.ok(cookie, "Sign-up should set a session cookie.");
  return cookie;
}

async function createProject(cookie, visibility, title) {
  const response = await request("/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: JSON.stringify({
      title,
      summary: "یک پروژه آزمایشی برای بررسی مسیرهای API و مجوزها.",
      disciplineSlug: "software",
      visibility
    })
  });

  const body = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    201,
    `Project creation should return HTTP 201; got ${response.status}: ${JSON.stringify(body)}`
  );
  assert.ok(body.project?.id, "The API should return the created project's identifier.");
  return body.project;
}

async function main() {
  const anonymousCreate = await request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Anonymous project attempt",
      summary: "This request must be rejected because it has no session.",
      disciplineSlug: "software",
      visibility: "public"
    })
  });
  assert.equal(anonymousCreate.status, 401, "Anonymous project creation must be rejected.");

  const ownerCookie = await register("HamPajuh CI Owner");
  const profileResponse = await request("/api/profile", {
    headers: { cookie: ownerCookie }
  });
  assert.equal(profileResponse.status, 200, "Authenticated users should receive an editable profile.");
  const profile = await profileResponse.json();
  assert.ok(profile.profile?.handle, "A default profile handle should be provisioned on first access.");

  const updatedProfileResponse = await request("/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      handle: "ci-researcher-" + randomUUID().slice(0, 6),
      headline: "پژوهشگر آزمون هم‌پژوه",
      bio: "پروفایل آزمایشی برای بررسی ذخیره و بازیابی اطلاعات.",
      location: "آزمایشگاه CI",
      website: "",
      isPublic: true
    })
  });
  assert.equal(updatedProfileResponse.status, 200, "Profile updates should be saved.");
  const updatedProfile = await updatedProfileResponse.json();
  assert.equal(updatedProfile.profile?.headline, "پژوهشگر آزمون هم‌پژوه");

  const publicProject = await createProject(
    ownerCookie,
    "public",
    "Public CI Project " + randomUUID().slice(0, 8)
  );
  const privateProject = await createProject(
    ownerCookie,
    "private",
    "Private CI Project " + randomUUID().slice(0, 8)
  );

  const listing = await request("/api/projects");
  assert.equal(listing.status, 200, "Public project listing should work.");
  const publicProjects = await listing.json();
  assert.ok(
    publicProjects.some((item) => item.id === publicProject.id),
    "The public project should appear in the public listing."
  );
  assert.ok(
    !publicProjects.some((item) => item.id === privateProject.id),
    "The private project must not appear in the public listing."
  );

  const collaboratorCookie = await register("HamPajuh CI Collaborator");
  const joinResponse = await request(
    `/api/projects/${publicProject.id}/join`,
    { method: "POST", headers: { cookie: collaboratorCookie } }
  );
  const joinBody = await joinResponse.json().catch(() => ({}));
  assert.equal(
    joinResponse.status,
    201,
    `A collaborator request should be created; got ${joinResponse.status}: ${JSON.stringify(joinBody)}`
  );

  const duplicateResponse = await request(
    `/api/projects/${publicProject.id}/join`,
    { method: "POST", headers: { cookie: collaboratorCookie } }
  );
  assert.equal(
    duplicateResponse.status,
    200,
    "A duplicate pending request should be handled without creating a second request."
  );

  console.log("PASS: anonymous writes are rejected");
  console.log("PASS: signup creates authenticated sessions");
  console.log("PASS: first login provisions a profile and profile edits persist");
  console.log("PASS: authenticated users can create projects");
  console.log("PASS: private projects are excluded from public discovery");
  console.log("PASS: collaboration requests are recorded and duplicate requests are handled");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
