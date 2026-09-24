{{/*
Expand the name of the chart.
*/}}
{{- define "weaver.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "weaver.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "weaver.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "weaver.labels" -}}
helm.sh/chart: {{ include "weaver.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: weaver
{{- end }}

{{/*
API selector labels
*/}}
{{- define "weaver.api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "weaver.name" . }}-api
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Web selector labels
*/}}
{{- define "weaver.web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "weaver.name" . }}-web
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Worker selector labels
*/}}
{{- define "weaver.worker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "weaver.name" . }}-worker
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PostgreSQL host
*/}}
{{- define "weaver.postgresql.host" -}}
{{- if .Values.postgresql.enabled }}
{{- fail "Bundled PostgreSQL is not supported; configure postgresql.external.host" }}
{{- else }}
{{- required "postgresql.external.host is required" .Values.postgresql.external.host }}
{{- end }}
{{- end }}

{{/*
Redis host
*/}}
{{- define "weaver.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- fail "Bundled Redis is not supported; configure redis.external.host" }}
{{- else }}
{{- required "redis.external.host is required" .Values.redis.external.host }}
{{- end }}
{{- end }}
