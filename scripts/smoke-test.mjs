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

  const anonymousDashboard = await request("/api/my/projects");
  assert.equal(anonymousDashboard.status, 401, "Anonymous users must not access the personal project dashboard.");

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

  const ownerProjectEdit = await request(`/api/projects/${publicProject.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      title: "Updated Public CI Project " + randomUUID().slice(0, 8),
      status: "active",
      summary: "پروژه آزمایشی به‌روزرسانی شده برای بررسی مجوزهای ویرایش و نمایش اطلاعات."
    })
  });
  assert.equal(ownerProjectEdit.status, 200, "Project owners should be able to update project metadata.");
  const ownerProjectEditBody = await ownerProjectEdit.json();
  assert.equal(ownerProjectEditBody.project?.status, "active");

  const ownerDashboardResponse = await request("/api/my/projects", {
    headers: { cookie: ownerCookie }
  });
  assert.equal(ownerDashboardResponse.status, 200, "Authenticated users should access their project dashboard.");
  const ownerDashboard = await ownerDashboardResponse.json();
  assert.ok(ownerDashboard.projects?.some((item) => item.id === publicProject.id), "The dashboard should include owned public projects.");
  assert.ok(ownerDashboard.projects?.some((item) => item.id === privateProject.id), "The dashboard should include owned private projects.");

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

  const publicProfilePath = "/api/profiles/" + encodeURIComponent(updatedProfile.profile.handle);
  const publicProfileResponse = await request(publicProfilePath);
  assert.equal(publicProfileResponse.status, 200, "A public profile should be readable without a login.");
  const publicProfile = await publicProfileResponse.json();
  assert.equal(publicProfile.profile?.handle, updatedProfile.profile.handle);
  assert.equal(publicProfile.user?.email, undefined, "Public profiles must not expose account email addresses.");
  assert.ok(publicProfile.projects?.some((item) => item.id === publicProject.id), "Public profiles should show public projects.");
  assert.ok(!publicProfile.projects?.some((item) => item.id === privateProject.id), "Public profiles must hide private projects.");

  const profileVisibilityPayload = {
    handle: updatedProfile.profile.handle,
    headline: updatedProfile.profile.headline ?? "",
    bio: updatedProfile.profile.bio ?? "",
    location: updatedProfile.profile.location ?? "",
    website: updatedProfile.profile.website ?? "",
    isPublic: false
  };
  const hideProfileResponse = await request("/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify(profileVisibilityPayload)
  });
  assert.equal(hideProfileResponse.status, 200, "Profile privacy can be disabled.");
  const hiddenProfileResponse = await request(publicProfilePath);
  assert.equal(hiddenProfileResponse.status, 404, "Private profiles must not be available through public endpoints.");

  const showProfileResponse = await request("/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ ...profileVisibilityPayload, isPublic: true })
  });
  assert.equal(showProfileResponse.status, 200, "Profile privacy can be restored.");

  assert.ok(publicProject.slug, "Created projects should receive a public-friendly slug.");
  const publicDetailResponse = await request("/api/projects/by-slug/" + encodeURIComponent(publicProject.slug));
  assert.equal(publicDetailResponse.status, 200, "Public project details should be readable without login.");
  const publicDetail = await publicDetailResponse.json();
  assert.equal(publicDetail.project?.id, publicProject.id);

  const hiddenPrivateDetail = await request("/api/projects/by-slug/" + encodeURIComponent(privateProject.slug));
  assert.equal(hiddenPrivateDetail.status, 404, "Private project details must be hidden from anonymous visitors.");
  const ownerPrivateDetail = await request("/api/projects/by-slug/" + encodeURIComponent(privateProject.slug), {
    headers: { cookie: ownerCookie }
  });
  assert.equal(ownerPrivateDetail.status, 200, "Project owners should be able to open their private projects.");

  const ownerRequests = await request(`/api/projects/${publicProject.id}/requests`, {
    headers: { cookie: ownerCookie }
  });
  assert.equal(ownerRequests.status, 200, "Project owners should be able to review collaboration requests.");

  const collaboratorCookie = await register("HamPajuh CI Collaborator");
  const unauthorizedProjectEdit = await request(`/api/projects/${publicProject.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ summary: "این تغییر نباید توسط عضو عادی پذیرفته شود." })
  });
  assert.equal(unauthorizedProjectEdit.status, 403, "Non-owners must not edit project metadata.");

  const forbiddenRequests = await request(`/api/projects/${publicProject.id}/requests`, {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(forbiddenRequests.status, 403, "Non-managers must not read collaboration requests.");

  const simultaneousJoins = await Promise.all([
    request(`/api/projects/${publicProject.id}/join`, {
      method: "POST",
      headers: { cookie: collaboratorCookie }
    }),
    request(`/api/projects/${publicProject.id}/join`, {
      method: "POST",
      headers: { cookie: collaboratorCookie }
    })
  ]);
  const simultaneousResults = await Promise.all(simultaneousJoins.map(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => ({}))
  })));
  assert.equal(
    simultaneousResults.filter((item) => item.status === 201).length,
    1,
    "Exactly one concurrent collaboration request should be created."
  );
  assert.equal(
    simultaneousResults.filter((item) => item.status === 200).length,
    1,
    "The competing duplicate request should be acknowledged without a second row."
  );
  const joinBody = simultaneousResults.find((item) => item.status === 201)?.body;
  assert.ok(joinBody?.requestId, "The collaboration request should have an identifier.");

  const pendingResponse = await request(`/api/projects/${publicProject.id}/requests`, {
    headers: { cookie: ownerCookie }
  });
  const pendingBody = await pendingResponse.json();
  assert.equal(pendingBody.requests?.length, 1, "The owner should see exactly one pending request.");

  const reviewResponse = await request(
    `/api/projects/${publicProject.id}/requests/${joinBody.requestId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ action: "accept" })
    }
  );
  assert.equal(reviewResponse.status, 200, "The owner should be able to accept a collaboration request.");

  const collaboratorDashboard = await request("/api/my/projects", {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(collaboratorDashboard.status, 200, "Accepted contributors should access their project dashboard.");
  const collaboratorProjects = await collaboratorDashboard.json();
  assert.ok(collaboratorProjects.projects?.some((item) => item.id === publicProject.id), "The collaborator dashboard should include the accepted project.");
  assert.ok(!collaboratorProjects.projects?.some((item) => item.id === privateProject.id), "Other users' private projects must never appear in a dashboard.");

  const joinedDetailResponse = await request("/api/projects/by-slug/" + encodeURIComponent(publicProject.slug));
  const joinedDetail = await joinedDetailResponse.json();
  assert.ok(joinedDetail.members?.some((member) => member.role === "contributor"), "Accepted collaborators should become project members.");

  const collaboratorProfileResponse = await request("/api/profile", {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(collaboratorProfileResponse.status, 200);
  const collaboratorProfile = await collaboratorProfileResponse.json();
  const collaboratorId = collaboratorProfile.user.id;

  const unauthorizedRoleChange = await request(
    `/api/projects/${publicProject.id}/members/${collaboratorId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: collaboratorCookie },
      body: JSON.stringify({ role: "viewer" })
    }
  );
  assert.equal(unauthorizedRoleChange.status, 403, "Only owners may change member roles.");

  const promoteMember = await request(
    `/api/projects/${publicProject.id}/members/${collaboratorId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ role: "maintainer" })
    }
  );
  assert.equal(promoteMember.status, 200, "Project owners should be able to promote collaborators.");
  const promotedDetailResponse = await request("/api/projects/by-slug/" + encodeURIComponent(publicProject.slug));
  const promotedDetail = await promotedDetailResponse.json();
  assert.ok(promotedDetail.members?.some((member) => member.role === "maintainer"), "Promoted members should receive the maintainer role.");

  const restoreContributor = await request(
    `/api/projects/${publicProject.id}/members/${collaboratorId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ role: "contributor" })
    }
  );
  assert.equal(restoreContributor.status, 200, "Project owners should be able to change a member role back.");

  const secondJoinResponse = await request(
    `/api/projects/${publicProject.id}/join`,
    { method: "POST", headers: { cookie: collaboratorCookie } }
  );
  assert.equal(secondJoinResponse.status, 409, "Existing members must not submit another join request.");

  console.log("PASS: anonymous writes are rejected");
  console.log("PASS: signup creates authenticated sessions");
  console.log("PASS: first login provisions a profile and profile edits persist");
  console.log("PASS: public profiles expose public projects but hide private projects and account email");
  console.log("PASS: private profiles return not found to public visitors");
  console.log("PASS: authenticated users can create projects");
  console.log("PASS: private projects are excluded from public discovery and hidden project detail");
  console.log("PASS: project owners can view private projects");
  console.log("PASS: only project owners can edit project metadata");
  console.log("PASS: personal project dashboard shows only projects the user belongs to");
  console.log("PASS: only owners can promote or change project member roles");
  console.log("PASS: collaboration requests are visible only to project managers");
  console.log("PASS: owners can accept requests and add contributors to the team");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
