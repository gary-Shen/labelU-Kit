import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Button, Form } from 'antd';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import _, { filter, isEmpty, size } from 'lodash-es';
import { omit } from 'lodash/fp';
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { Bridge } from 'iframe-message-bridge';

import { message, modal } from '@/StaticAnt';
import type { TaskResponse } from '@/services/types';
import { MediaType, TaskStatus } from '@/services/types';
import type { Dispatch, RootState } from '@/store';
import { createSamples } from '@/services/samples';
import { deleteFile } from '@/services/task';
import { convertVideoConfig } from '@/utils/convertVideoConfig';

import type { QueuedFile } from './partials/inputData';
import InputData, { UploadStatus } from './partials/inputData';
import AnnotationConfig from './partials/annotationConfig';
import InputInfoConfig from './partials/InputInfoConfig';
import currentStyles from './index.module.scss';
import type { StepData } from './components/Step';
import Step from './components/Step';
import commonController from '../../utils/common/common';
import { TaskCreationContext } from './taskCreation.context';

enum StepEnum {
  Basic = 'basic',
  Upload = 'upload',
  Config = 'config',
}

const stepTitleMapping = {
  [StepEnum.Basic]: '基础配置',
  [StepEnum.Upload]: '数据导入',
  [StepEnum.Config]: '标注配置',
};

const partialMapping = {
  [StepEnum.Basic]: InputInfoConfig,
  [StepEnum.Upload]: InputData,
  [StepEnum.Config]: AnnotationConfig,
};

const StyledFooter = styled.div`
  display: flex;
  justify-content: end;
  margin-top: 1rem;
`;

interface TaskStep extends StepData {
  value: StepEnum;
}

export interface PartialConfigProps {
  task: TaskResponse;
  updateFormData: (field: string) => (value: string) => void;
}

const CreateTask = () => {
  const dispatch = useDispatch<Dispatch>();
  const navigate = useNavigate();
  const routeParams = useParams();
  const location = useLocation();
  const [annotationFormInstance] = Form.useForm();
  const [basicFormInstance] = Form.useForm();
  const modalRef = useRef<any>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<Bridge | null>(null);

  const taskId = routeParams.taskId ? parseInt(routeParams.taskId, 10) : 0;
  const [currentStep, setCurrentStep] = useState<StepEnum>(
    location.hash ? (location.hash.replace('#', '') as StepEnum) : StepEnum.Basic,
  );
  const searchParams = new URLSearchParams(location.search);
  const isCreateNewTask = searchParams.get('isNew') === 'true';
  const [isAnnotationFormValid, toggleAnnotationFormValidation] = useState<boolean>(true);
  const attachmentsConnected = useRef<boolean>(false);

  // 缓存上传的文件清单
  const [uploadFileList, setUploadFileList] = useState<QueuedFile[]>([]);

  const updateCurrentStep = useCallback(
    (step: StepEnum) => {
      setCurrentStep(step);
      navigate({
        pathname: location.pathname,
        hash: step,
        search: location.search,
      });
    },
    [location.pathname, location.search, navigate],
  );

  const partials = useMemo(() => {
    return _.chain(partialMapping)
      .toPairs()
      .map(([key, Partial], index) => {
        return (
          <div key={index} style={{ display: currentStep === key ? 'block' : 'none' }}>
            <Partial />
          </div>
        );
      })
      .value();
  }, [currentStep]);

  const toolsConfig = useSelector((state: RootState) => state.task.config);
  const samples = useSelector((state: RootState) => state.sample.list);
  const taskData = useSelector((state: RootState) => state.task.item);
  const loading = useSelector(
    (state: RootState) => state.loading.effects.task.updateTaskConfig || state.loading.effects.task.createTask,
  );
  const isExistTask = taskId > 0;
  const taskStatus = _.get(taskData, 'status') as TaskStatus;
  const stepDataSource: TaskStep[] = useMemo(
    () => [
      {
        title: stepTitleMapping[StepEnum.Basic],
        value: StepEnum.Basic,
        isFinished: isExistTask,
      },
      {
        title: stepTitleMapping[StepEnum.Upload],
        value: StepEnum.Upload,
        isFinished: taskStatus && taskStatus !== TaskStatus.DRAFT,
      },
      {
        title: stepTitleMapping[StepEnum.Config],
        value: StepEnum.Config,
        isFinished: [TaskStatus.CONFIGURED, TaskStatus.FINISHED, TaskStatus.INPROGRESS].includes(taskStatus),
      },
    ],
    [isExistTask, taskStatus],
  );

  useEffect(() => {
    if (!location.hash) {
      return;
    }

    setCurrentStep(location.hash.replace('#', '') as StepEnum);
  }, [location.hash]);

  // 将store中的task toolConfig数据同步到本地页面中
  useEffect(() => {
    annotationFormInstance.setFieldsValue(toolsConfig);
  }, [annotationFormInstance, toolsConfig]);

  useEffect(() => {
    basicFormInstance.setFieldsValue(taskData);
  }, [annotationFormInstance, basicFormInstance, taskData]);

  useEffect(() => {
    if (isExistTask && _.isEmpty(taskData)) {
      dispatch.task.fetchTask(taskId);
    }
  }, [dispatch.task, isExistTask, taskData, taskId]);

  useEffect(() => {
    if (isEmpty(toolsConfig?.tools)) {
      toggleAnnotationFormValidation(false);
    }
  }, [toolsConfig?.tools]);

  const onAnnotationFormChange = useCallback(() => {
    annotationFormInstance.validateFields().then((values) => {
      toggleAnnotationFormValidation(size(values.tools) > 0);
    });
  }, [annotationFormInstance]);

  const handleSave = useCallback(
    async function (isFromCancel?: boolean) {
      try {
        await annotationFormInstance.validateFields();
      } catch (err) {
        commonController.notificationErrorMessage({ message: '请检查标注配置' }, 1);
        return;
      }

      const annotationConfig = annotationFormInstance.getFieldsValue();

      if (
        _.chain(annotationConfig).get('tools').isEmpty().value() &&
        currentStep === StepEnum.Config &&
        !isFromCancel
      ) {
        commonController.notificationErrorMessage({ message: '请选择工具' }, 1);
        return;
      }

      return dispatch.task
        .updateTaskConfig({
          taskId: taskId,
          body: {
            ...taskData,
            ...basicFormInstance.getFieldsValue(),
            config: annotationConfig,
          },
        })
        .then(() => {
          navigate(`/tasks/${taskData.id}`);
        });
    },
    [annotationFormInstance, basicFormInstance, currentStep, dispatch.task, navigate, taskData, taskId],
  );

  const [previewVisible, setPreviewVisible] = useState(false);
  const handleOpenPreview = useCallback(() => {
    dispatch.sample.fetchSamples({ task_id: taskId });
    annotationFormInstance
      .validateFields()
      .then(() => {
        setPreviewVisible(true);
      })
      .catch(() => {
        commonController.notificationErrorMessage({ message: '请检查标注配置' }, 1);
      });
  }, [annotationFormInstance, dispatch.sample, taskId]);

  const correctSampleIdsMappings = useMemo(
    () =>
      _.chain(samples)
        .get('data')
        .mapKeys((item) => {
          return _.chain(item.data?.fileNames).keys().first().value();
        })
        .value(),
    [samples],
  );

  const submitForm: (isFromCancel?: boolean) => Promise<unknown> = useCallback(
    async function (isFromCancel) {
      let basicFormValues;
      try {
        basicFormValues = await basicFormInstance.validateFields();
      } catch (err) {
        return Promise.reject();
      }

      if (isExistTask) {
        if (currentStep === StepEnum.Upload && !_.isEmpty(uploadFileList) && !attachmentsConnected.current) {
          await createSamples(
            taskId,
            _.chain(uploadFileList)
              .filter((item) => item.status === UploadStatus.Success)
              .map((item) => ({
                attachement_ids: [item.id!],
                data: {
                  fileNames: {
                    [item.id!]: item.name!,
                  },
                  result: '{}',
                  urls: {
                    [item.id!]: item.url!,
                  },
                },
              }))
              .value(),
          );

          // 切换到其他步骤后，再切换回来，不会再次创建文件
          attachmentsConnected.current = true;
        }

        const annotationConfig = annotationFormInstance.getFieldsValue();

        dispatch.sample.fetchSamples({ task_id: taskId });

        return dispatch.task
          .updateTaskConfig({
            taskId: taskId,
            body: {
              ...taskData,
              ...basicFormValues,
              status: taskData.status === TaskStatus.DRAFT ? TaskStatus.IMPORTED : taskData.status,
              config: omit(['media_type'])(annotationConfig),
            },
          })
          .then(() => {
            if (isFromCancel) {
              navigate('/tasks');
            }
          });
      } else {
        const newTask = await dispatch.task.createTask(basicFormValues);

        // 取消并保存时，跳转到任务列表页
        if (isFromCancel) {
          navigate('/tasks');
        } else {
          navigate(`/tasks/${newTask.id}/edit${location.search}#${StepEnum.Upload}`);
        }

        return Promise.reject();
      }
    },
    [
      annotationFormInstance,
      basicFormInstance,
      currentStep,
      dispatch.sample,
      dispatch.task,
      isExistTask,
      location.search,
      navigate,
      taskData,
      taskId,
      uploadFileList,
    ],
  );

  const handleCancel = useCallback(async () => {
    // 在上传数据界面取消时，需要删除已上传的文件\删除已创建的任务
    const uploadedFiles = filter(uploadFileList, (item) => item.status === UploadStatus.Success);
    if (uploadedFiles.length > 0) {
      await deleteFile(
        { task_id: taskId },
        {
          attachment_ids: uploadedFiles.map((item) => item.id!),
        },
      );

      const uploadedSampleIds = uploadedFiles
        .filter((item) => correctSampleIdsMappings[item.id!])
        .map((item) => correctSampleIdsMappings[item.id!].id!);

      if (uploadedSampleIds.length > 0) {
        await dispatch.sample.deleteSamples({
          task_id: taskId,
          body: { sample_ids: uploadedSampleIds },
        });
      }
    }

    if (isCreateNewTask && isExistTask) {
      await dispatch.task.deleteTask(taskId);
    }

    modalRef.current.destroy();
    navigate('/tasks');
  }, [
    correctSampleIdsMappings,
    dispatch.sample,
    dispatch.task,
    isCreateNewTask,
    isExistTask,
    navigate,
    taskId,
    uploadFileList,
  ]);

  const handleCancelConfirm = useCallback(() => {
    modalRef.current = modal.confirm({
      title: '提示',
      content: '是否保存已编辑的内容？',
      okText: '保存并退出',
      cancelText: '不保存',
      closable: true,
      footer: (
        <StyledFooter>
          <Button onClick={handleCancel}>不保存</Button>
          <Button
            type="primary"
            onClick={async () => {
              modalRef.current.destroy();

              if (currentStep !== StepEnum.Config) {
                await submitForm(true);
              } else {
                await handleSave(true);
              }
            }}
          >
            保存并退出
          </Button>
        </StyledFooter>
      ),
    });
  }, [handleCancel, currentStep, submitForm, handleSave]);

  const handleNextStep = useCallback(
    async function (step: TaskStep | React.MouseEvent) {
      let nextStep = step;
      // 点击下一步时，step为事件参数
      if ((step as React.MouseEvent).target) {
        const stepIndex = stepDataSource.findIndex((item) => item.value === currentStep);
        nextStep = stepDataSource[stepIndex + 1];
      }

      // 如果是从基本信息步骤到下一步，需要校验基本信息表单
      if (currentStep === StepEnum.Basic) {
        try {
          await basicFormInstance.validateFields();
        } catch (err) {
          return;
        }
      }

      // 如果是从「数据导入」到下一步，没有文件时不可进入下一步
      if (
        currentStep === StepEnum.Upload &&
        isEmpty(samples.data) &&
        filter(uploadFileList, (item) => item.status === UploadStatus.Success).length === 0
      ) {
        message.error('请至少上传一个文件');
        return;
      }

      submitForm()
        .then(() => {
          updateCurrentStep((nextStep as TaskStep).value);
        })
        .catch(() => {});
    },
    [basicFormInstance, currentStep, samples.data, stepDataSource, submitForm, updateCurrentStep, uploadFileList],
  );

  const handlePrevStep = async (step: TaskStep, lastStep: TaskStep) => {
    // 如果是从标注配置步骤回到上一步，需要校验配置表单
    if (lastStep.value === StepEnum.Config) {
      try {
        await annotationFormInstance.validateFields();
      } catch (err) {
        message.error('请检查标注配置');
        return;
      }

      if (previewVisible) {
        setPreviewVisible(false);
      }
    }
    submitForm()
      .then(() => {
        updateCurrentStep(step.value);
      })
      .catch(() => {});
  };

  const actionNodes = useMemo(() => {
    if (currentStep === StepEnum.Config) {
      if (previewVisible) {
        return (
          <Button onClick={() => setPreviewVisible(false)}>
            <ArrowLeftOutlined />
            退出预览
          </Button>
        );
      }
      const previewDisabled = !isAnnotationFormValid || isEmpty(samples.data);
      return (
        <>
          <Button onClick={handleOpenPreview} disabled={previewDisabled || isEmpty(samples.data)}>
            进入预览
            <ArrowRightOutlined />
          </Button>
          <Button onClick={handleCancelConfirm}>取消</Button>
          <Button loading={loading} type="primary" onClick={commonController.debounce(handleSave, 200)}>
            保存
          </Button>
        </>
      );
    }

    return (
      <>
        <Button onClick={handleCancelConfirm}>取消</Button>

        <Button loading={loading} type="primary" onClick={commonController.debounce(handleNextStep, 100)}>
          下一步
        </Button>
      </>
    );
  }, [
    currentStep,
    handleCancelConfirm,
    loading,
    handleNextStep,
    previewVisible,
    isAnnotationFormValid,
    samples.data,
    handleOpenPreview,
    handleSave,
  ]);

  const taskCreationContextValue = useMemo(
    () => ({
      uploadFileList,
      setUploadFileList,
      annotationFormInstance,
      basicFormInstance,
      task: taskData,
      onAnnotationFormChange,
    }),
    [uploadFileList, annotationFormInstance, basicFormInstance, taskData, onAnnotationFormChange],
  );

  useLayoutEffect(() => {
    if (!previewIframeRef.current) {
      return;
    }

    if (bridgeRef.current) {
      bridgeRef.current.destroy();
      bridgeRef.current = null;
    }

    bridgeRef.current = new Bridge(previewIframeRef.current.contentWindow!);
    bridgeRef.current.on('ready', () => {
      let _config;

      if (taskData.media_type === MediaType.VIDEO) {
        _config = convertVideoConfig(annotationFormInstance.getFieldsValue());
      } else if (taskData.media_type === MediaType.IMAGE) {
        _config = annotationFormInstance.getFieldsValue();
      }

      if (bridgeRef.current) {
        bridgeRef.current.post('preview', _config);
      }
    });
  }, [previewVisible, annotationFormInstance, taskData.media_type]);

  return (
    <div className={currentStyles.outerFrame}>
      <div className={currentStyles.stepsRow}>
        <div className={currentStyles.left}>
          <Step steps={stepDataSource} currentStep={currentStep} onNext={handleNextStep} onPrev={handlePrevStep} />
        </div>
        <div className={currentStyles.right}>{actionNodes}</div>
      </div>
      <div className={currentStyles.content}>
        <TaskCreationContext.Provider value={taskCreationContextValue}>
          <div className="form-content" style={{ display: previewVisible ? 'none' : 'block' }}>
            {partials}
          </div>

          {previewVisible && (
            <iframe
              referrerPolicy="no-referrer"
              ref={previewIframeRef}
              className={currentStyles.previewIframe}
              src={`/tasks/${taskData.id}/samples/${samples?.data?.[0].id}?noSave=true`}
            />
          )}
        </TaskCreationContext.Provider>
      </div>
    </div>
  );
};

export default CreateTask;
